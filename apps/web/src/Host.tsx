import { GameTimer, HighScoreTable, useGameClock, fmtTime } from "./HighScores";
import { Marquee } from "./Marquee";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { DEFAULT_CONFIG, commonSingleArtist, sanitizeConfig, type ClientMessage, type GameConfig, type PlayerCommand, type RoomState } from "@tuneguesser/shared";
import { FoundChips, GameSummary, GuessBar, Hints, PixelArt, ScoreBanner } from "./Found";
import { ScoreLine, Scoreboard } from "./Scoreboard";
import { SettingsMenu } from "./Settings";
import { useCountdown, useRoom, useScrollTop } from "./net";
import { Play } from "./Player";
import { setMuted, sfx } from "./sfx";
import { Glyph, PadHint } from "./input/Glyph";
import { Logo } from "./Logo";
import { ErrorPage } from "./ErrorPage";
import { VoteButtons } from "./Vote";
import { MicToggle } from "./input/Mic";
import { Confirm } from "./input/Confirm";
import { useYouTubePlayer } from "./YouTubePlayer";
import { onPadButton, usePad } from "./input/pad";
import { t } from "./i18n";

interface Playlist { id: string; name: string; tracks: number; image?: string }
interface Device { id: string; name: string; type: string; active: boolean }
interface Saved { code: string; token: string; youtube?: boolean }

const load = (): Saved | null => {
  try { return JSON.parse(sessionStorage.getItem("tg_room") ?? "null"); } catch { return null; }
};

/** `solo`: one player on this screen, no lobby and no room code. */
export function Host({ solo, onBack }: { solo?: boolean; onBack?: () => void }) {
  const [saved, setSaved] = useState<Saved | null>(load);
  const isSolo = solo || (!!saved && sessionStorage.getItem("tg_solo") === "1");
  return saved ? (
    <Game saved={saved} solo={isSolo} onLeave={() => { ["tg_room", "tg_solo", "tg_hostplayer"].forEach((k) => sessionStorage.removeItem(k)); setSaved(null); }} />
  ) : (
    <Setup solo={isSolo} onBack={onBack} onCreated={(s) => { sessionStorage.setItem("tg_room", JSON.stringify(s)); if (isSolo) sessionStorage.setItem("tg_solo", "1"); else sessionStorage.removeItem("tg_solo"); setSaved(s); }} />
  );
}

function Seg<T extends string | number | boolean>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => <button type="button" key={String(v)} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{t(label)}</button>)}
    </div>
  );
}

const LAST_PLAYLISTS = "tg_playlists";
/** YouTube mode starts with this playlist until the host changes the list */
const DEFAULT_YT_PLAYLISTS = [
  "PLLLGHxXtD0Z4", // Top 100 most streamed songs
  "PL7DA3D097D6FDBC02", // 90's hits
  "PLGBuKfnErZlCXt8Q61VQYu9lQQruuFFoB", // DJ songs 2000-2020
  "PLGBuKfnErZlB3AThAEKz8_3kbYTocgfbB", // 2010s pop
  "PLGBuKfnErZlAG7oSbCe1DBVZsDRzBjaw5", // classic rock 60s-80s
  "PLGBuKfnErZlDWlLLxjNJh6Spsn2_TppcF", // 2000s rock
  "PL0jp-uZ7a4g9FQWW5R_u0pz4yzV4RiOXu", // The Beatles 100
  "PLdHiRrMNS0D3gw0mjudLXoGYxiEpGvdUa", // Prince Greatest Hits
  "PLD8F8D858996445F4", // U2
  "PLp3o6lwxnqMkm9dUECwqVBQY0IN6n1wH_", // Led Zeppelin
  "PLr5pQJcv3NjbTTxr--i3wzxsQbwRyASN5", // classic rock 60s-90s (239)
];
const LAST_CONFIG = "tg_config";
const readJson = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };

function Setup({ onCreated, solo, onBack }: { onCreated: (s: Saved) => void; solo?: boolean; onBack?: () => void }) {
  const [playerName, setPlayerName] = useState(() => { try { return localStorage.getItem("tg_name") || ""; } catch { return ""; } });
  const [me, setMe] = useState<{ spotify: boolean; spotifyConfigured: boolean; youtube?: boolean }>();
  // music source: Spotify (account + a playing device) or YouTube (playlist links, plays on this screen)
  const [source, setSource] = useState<"spotify" | "youtube">(() => (readJson<string>("tg_music", "youtube") === "spotify" ? "spotify" : "youtube")); // YouTube is the default
  const [ytLists, setYtLists] = useState<Array<{ id: string; name: string; tracks: number; image?: string }>>(() => readJson("tg_ytlists", []));
  /** playlists that stay in the list but are switched off for the next game */
  const [ytOff, setYtOff] = useState<string[]>(() => readJson<string[]>("tg_ytoff", []));
  const [ytInput, setYtInput] = useState("");
  const useYt = source === "youtube" && !!me?.youtube;
  const addYt = async () => {
    if (!ytInput.trim()) return;
    setErr("");
    const r = await fetch(`/api/youtube/playlist?url=${encodeURIComponent(ytInput.trim())}`);
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? t("Could not add that playlist"));
    setYtLists((cur) => (cur.some((x) => x.id === j.id) ? cur : [...cur, j]));
    setYtInput("");
  };
  // the default playlists are always there (they cannot be removed, only switched off); any that is missing is fetched again
  useEffect(() => {
    if (!useYt) return;
    const todo = DEFAULT_YT_PLAYLISTS.filter((id) => !ytLists.some((l) => l.id === id));
    if (!todo.length) return;
    void Promise.all(todo.map((id) => fetch(`/api/youtube/playlist?url=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))).then((found) => {
      const ok = found.filter((j): j is { id: string; name: string; tracks: number; image?: string } => !!j);
      if (ok.length) setYtLists((cur) => [...ok.filter((j) => !cur.some((x) => x.id === j.id)), ...cur]);
    });
  }, [useYt]);
  useEffect(() => { try { localStorage.setItem("tg_ytlists", JSON.stringify(ytLists)); localStorage.setItem("tg_music", JSON.stringify(source)); } catch { /* storage blocked */ } }, [ytLists, source]);
  useEffect(() => { try { localStorage.setItem("tg_ytoff", JSON.stringify(ytOff)); } catch { /* storage blocked */ } }, [ytOff]);
  const ytPicked = ytLists.filter((l) => !ytOff.includes(l.id));
  // playlists marked "one artist only" on their page: if every selected one is by the same artist, only the song can be guessed
  const [onlyArtists, setOnlyArtists] = useState<Record<string, string | null>>({});
  const pickedKey = ytPicked.map((l) => l.id).join(",");
  useEffect(() => {
    if (!useYt || !pickedKey) return;
    fetch(`/api/playlist/settings?ids=${encodeURIComponent(pickedKey)}`).then((r) => r.json()).then((j: unknown) => { if (j && typeof j === "object") setOnlyArtists(j as Record<string, string | null>); }).catch(() => {});
  }, [useYt, pickedKey]);
  const oneArtist = useYt ? commonSingleArtist(ytPicked.map((l) => onlyArtists[l.id])) : null;
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [picked, setPicked] = useState<string[]>(() => readJson<string[]>(LAST_PLAYLISTS, []));
  const [deviceId, setDeviceId] = useState("");
  const [cfg, setCfg] = useState<GameConfig>(() => sanitizeConfig({ ...DEFAULT_CONFIG, ...readJson<Partial<GameConfig>>(LAST_CONFIG, {}) }));
  useEffect(() => { if (oneArtist && cfg.guess !== "title") setCfg((c) => ({ ...c, guess: "title" })); }, [oneArtist, cfg.guess]);
  useEffect(() => { try { localStorage.setItem(LAST_CONFIG, JSON.stringify(cfg)); } catch { /* storage blocked */ } }, [cfg]); // survives a visit to a playlist page
  const canStart = useYt ? ytPicked.length > 0 : picked.length > 0 && !!deviceId;
  const set = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const [err, setErr] = useState(new URLSearchParams(location.search).get("error") ? t("Spotify login failed, try again.") : "");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => () => clearInterval(poll.current), []);
  const [pairing, setPairing] = useState<{ code: string; url: string; qr: string; nonce: string }>();
  const stopLogin = () => { clearInterval(poll.current); setWaiting(false); setPairing(undefined); };
  /**
   * Android app / TV: Spotify refuses logins inside an embedded web view, and a TV has no browser. So the login happens on another
   * device (scan the QR code or open the short link on a phone) or in this device's browser; the app then claims the result.
   */
  const appLogin = async (e: React.MouseEvent) => {
    const app = (window as unknown as { TuneGuesserApp?: { openExternal?: (url: string) => void } }).TuneGuesserApp;
    if (!app) return; // normal browsers: the plain link works
    e.preventDefault();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      const { code } = await fetch(`/api/auth/pair?nonce=${nonce}`).then((x) => x.json());
      const url = `${location.origin}/api/l/${code}`;
      setPairing({ code, url, nonce, qr: await QRCode.toDataURL(url, { margin: 1, width: 300, color: { dark: "#0b0b1a", light: "#ffffff" } }) });
    } catch { setErr(t("Cannot reach the server")); return; }
    setWaiting(true);
    clearInterval(poll.current);
    const until = Date.now() + 10 * 60_000;
    poll.current = setInterval(async () => {
      if (Date.now() > until) { stopLogin(); return; }
      try {
        const r = await fetch(`/api/auth/claim?nonce=${nonce}`).then((x) => x.json());
        if (r.ok) { stopLogin(); setMe(await fetch("/api/me").then((x) => x.json())); }
      } catch { /* keep trying */ }
    }, 1500);
  };
  const openHere = () => {
    const app = (window as unknown as { TuneGuesserApp?: { openExternal?: (url: string) => void } }).TuneGuesserApp;
    if (pairing) app?.openExternal?.(`${location.origin}/api/auth/login?app=${pairing.nonce}`);
  };

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => setErr(t("Cannot reach the server")));
  }, []);

  const loadDevices = () => fetch("/api/devices").then((r) => r.json()).then((raw: unknown) => {
    const d: Device[] = Array.isArray(raw) ? raw : []; // an error object (login expired, Spotify down) is not a list
    setDevices(d);
    setDeviceId((cur) => cur || d.find((x) => x.active)?.id || d[0]?.id || "");
  }).catch(() => {});

  useEffect(() => {
    if (!me?.spotify) return;
    fetch("/api/playlists").then((r) => r.json()).then((raw: unknown) => {
      if (!Array.isArray(raw)) throw new Error("not a list");
      const p: Playlist[] = raw;
      setPlaylists(p);
      setPicked((cur) => cur.filter((id) => p.some((x) => x.id === id))); // forget playlists that are gone
    }).catch(() => setErr(t("Could not load playlists")));
    void loadDevices();
  }, [me?.spotify]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const create = async () => {
    setBusy(true); setErr("");
    sfx.start(); // unlocks audio on this screen
    try { localStorage.setItem(LAST_PLAYLISTS, JSON.stringify(picked)); localStorage.setItem(LAST_CONFIG, JSON.stringify(cfg)); } catch { /* storage blocked */ }
    const name = playerName.trim() || t("Player");
    if (solo) {
      try { localStorage.setItem("tg_name", name); } catch { /* storage blocked */ }
      sessionStorage.setItem("tg_hostplayer", JSON.stringify({ name })); // this screen plays: the lobby is skipped
    }
    const r = await fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ ...(useYt ? { source: "youtube", playlistIds: ytPicked.map((l) => l.id) } : { playlistIds: picked, deviceId: deviceId || undefined }), config: solo ? { ...cfg, order: "buzzer" } : cfg }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? t("Could not create room"));
    onCreated({ code: j.code, token: j.hostToken, youtube: useYt || undefined });
  };

  const timed = cfg.roundSeconds !== null;
  const options = (
    <>
          <section className="card opts">
            <button type="button" className="btn ghost reset-opts" onClick={() => set({ ...DEFAULT_CONFIG, hints: { ...DEFAULT_CONFIG.hints } })}>↺ {t("Reset settings to defaults")}</button>
            {solo && <label>{t("Your name")}<input value={playerName} maxLength={16} autoComplete="nickname" onChange={(e) => setPlayerName(e.target.value)} placeholder={t("Player")} /></label>}
            {!useYt && (
              <div className="opt"><span>{t("Music plays on")}</span>
                <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} onFocus={loadDevices}>
                  {devices.length === 0 && <option value="">{t("No device found – open Spotify somewhere")}</option>}
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type}){d.active ? " ●" : ""}</option>)}
                </select>
              </div>
            )}
            <div className="opt"><span>{t("Play to")}</span>
              <Seg value={cfg.playTo.kind} options={[["rounds", "Rounds"], ["score", "Score"]]} onChange={(k) => set({ playTo: k === "rounds" ? { kind: "rounds", rounds: 10 } : { kind: "score", target: 5000 } })} />
              {cfg.playTo.kind === "rounds"
                ? <label>{t("Rounds")} <input type="number" min={1} max={100} value={cfg.playTo.rounds} onChange={(e) => set({ playTo: { kind: "rounds", rounds: +e.target.value } })} /></label>
                : <label>{t("Target score")} <input type="number" min={500} max={100000} step={500} value={cfg.playTo.target} onChange={(e) => set({ playTo: { kind: "score", target: +e.target.value } })} /></label>}
            </div>
            {!solo && (
              <div className="opt"><span>{t("Play order")}</span>
                <Seg value={cfg.order} options={[["buzzer", "Buzzer"], ["roundRobin", "Round robin"]]} onChange={(order) => set({ order })} />
                <small className="muted">{cfg.order === "buzzer" ? t("Everyone can buzz in; the first to press ANSWER guesses.") : t("Players take turns: each player gets one song to guess, or skip.")}</small>
              </div>
            )}
            <div className="opt"><span>{t("Guess")}</span>
              <Seg value={cfg.guess} options={oneArtist ? [["title", "Song"]] : [["both", "Both"], ["title", "Song"], ["artist", "Artist"]]} onChange={(guess) => set({ guess })} />
              {oneArtist && <small className="muted">{t("All selected playlists are by {artist}: only the song title is guessed.", { artist: oneArtist })}</small>}
              {cfg.guess !== "both" && <small className="muted">{cfg.guess === "title" ? t("Only the song title counts. Handy when the playlist is one artist.") : t("Only the artist counts. Handy for mixed playlists where you only care who it is.")}</small>}
            </div>
            <div className="opt"><span>{t("Answers")}</span>
              <Seg value={cfg.answers} options={[["type", "Type"], ["choice", "Multiple choice"]]} onChange={(answers) => set({ answers })} />
              {cfg.answers === "choice" && <small className="muted">{t("4 options, the wrong ones are other songs from the playlist(s).")}</small>}
            </div>
            <div className="opt"><span>{t("Hints")}</span>
              <div className="seg" role="group" aria-label={t("Hints")}>
                {([["reveal", "Reveal letters"], ["trivia", "Trivia"], ["art", "Artwork"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className={cfg.hints[k] ? "on" : ""} aria-pressed={cfg.hints[k]} onClick={() => set({ hints: { ...cfg.hints, [k]: !cfg.hints[k] } })}>{cfg.hints[k] ? "✓ " : ""}{t(label)}</button>
                ))}
              </div>
              <small className="muted">{!cfg.hints.reveal && !cfg.hints.trivia && !cfg.hints.art ? t("No hints.") : [cfg.hints.reveal && t("Reveal: underscores, letters appear after 10 s."), cfg.hints.trivia && t("Trivia: facts from MusicBrainz and Wikipedia."), cfg.hints.art && t("Artwork: pixelated cover that sharpens over time.")].filter(Boolean).join(" ")}</small>
            </div>
            <div className="opt"><span>{t("Song starts")}</span>
              <Seg value={cfg.start} options={[["random", "Random start"], ["beginning", "From the beginning"]]} onChange={(start) => set({ start })} />
            </div>
            <div className="opt"><span>{t("Next song")}</span>
              <Seg value={cfg.autoAdvance} options={[[true, "Automatic"], [false, "Song end / Manually skip"]]} onChange={(autoAdvance) => set({ autoAdvance })} />
            </div>
            <div className="opt"><span>{t("Timer")}</span>
              <Seg value={timed} options={[[true, "Seconds per song"], [false, "Unlimited"]]} onChange={(t) => set({ roundSeconds: t ? 40 : null })} />
              {timed && <label>{t("Seconds")} <input type="number" min={10} max={120} value={cfg.roundSeconds ?? 40} onChange={(e) => set({ roundSeconds: +e.target.value })} /></label>}
              {!timed && <small className="muted">{t("The round lasts until the song ends.")}</small>}
            </div>
            <div className="opt"><span>{t("Attempts per round")}</span>
              <Seg value={cfg.attempts} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} onChange={(attempts) => set({ attempts })} />
            </div>
            <div className="opt"><span>{t("Score multipliers")}</span>
              <Seg value={cfg.multipliers} options={[[true, "Yes"], [false, "No"]]} onChange={(multipliers) => set({ multipliers })} />
              <small className="muted">{t("Extra points for song + artist at once, and for streaks.")}</small>
            </div>
          </section>
          <button className="btn big" disabled={!canStart || busy} onClick={() => create()}>{solo ? t("Start the game") : t("Create room")}<PadHint button="a" focusOnly /></button>
    </>
  );
  return (
    <main className="screen setup">
      {onBack && <button className="backlink" onClick={onBack}>{t("← Menu")}</button>}
      <SettingsMenu apk solo />
      <Logo />
      {err && <p className="error">{err}</p>}
      {me?.youtube && (
        <div className="card source-pick"><span>{t("Music from")}</span><Seg value={source} options={[["youtube", "YouTube (No account needed)"], ["spotify", "Spotify (Premium)"]]} onChange={(v) => setSource(v)} /></div>
      )}
      {!me ? <p className="muted">{t("Loading…")}</p> : useYt ? (
        <>
          <div className="quick">
            <button className="btn big" data-pad-first data-pad-quick disabled={!canStart || busy} title={t("Play with the last settings")} onClick={() => create()}>⚡ {t("Quickstart")}<PadHint button="y" /></button>
          </div>
          <section className="card">
            <h2>{t("YouTube playlists")} {ytLists.length > 0 && <small className="muted">({t("{n} selected", { n: ytPicked.length })})</small>}</h2>
            <p className="muted pl-note">{t("Paste the link of a public or unlisted playlist (YouTube or YouTube Music). The music plays on this screen, no account needed.")}</p>
            <form className="yt-add" onSubmit={(e) => { e.preventDefault(); void addYt(); }}>
              <input value={ytInput} onChange={(e) => setYtInput(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…" inputMode="url" aria-label={t("YouTube playlist link")} />
              <button className="btn" type="submit">{t("Add")}</button>
            </form>
            <div className="grid">
              {ytLists.map((p) => (
                <div key={p.id} className="pl-wrap">
                  <button className={"pl" + (ytOff.includes(p.id) ? "" : " sel")} aria-pressed={!ytOff.includes(p.id)} onClick={() => setYtOff((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}>
                    {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                    <Marquee text={p.name} /><small>{t("{n} videos", { n: p.tracks })}</small>
                  </button>
                  <a className="pl-cog" href={`/playlist/${encodeURIComponent(p.id)}`} aria-label={t("Songs and settings of this playlist")} title={t("Songs and settings of this playlist")}>⚙</a>
                  {!DEFAULT_YT_PLAYLISTS.includes(p.id) && <button className="pl-x" aria-label={t("Remove playlist")} title={t("Remove playlist")} onClick={() => { setYtLists((cur) => cur.filter((x) => x.id !== p.id)); setYtOff((cur) => cur.filter((x) => x !== p.id)); }}>✕</button>}
                </div>
              ))}
            </div>
          </section>
          {options}
        </>
      ) : !me.spotify ? (
        <div className="card center">
          <p>{t("Log in with the Spotify account that will play the music (Premium required).")}</p>
          {me.spotifyConfigured ? <a className="btn big" href="/api/auth/login" data-pad-first onClick={appLogin}>{t("Log in with Spotify")}<PadHint button="a" focusOnly /></a> : <p className="error">{t("Server has no SPOTIFY_CLIENT_ID.")}</p>}
          {pairing && (
            <div className="pairing-overlay padtext" role="dialog" aria-label={t("Log in on another device")}>
              <div className="card pairing">
                <h2>{t("Log in to Spotify on another device")}</h2>
                <div className="pairing-body">
                  <img src={pairing.qr} alt={t("QR code to log in")} className="qr" />
                  <div className="pairing-side">
                    <p>{t("Scan the code with your phone, or open")} <b>{pairing.url.replace(/^https?:\/\//, "")}</b></p>
                    <p className="muted">{t("Log in to Spotify there (Premium). This screen continues by itself.")}</p>
                    <button className="btn" data-pad-first onClick={openHere}>{t("Use this device's browser")}</button>
                    <button className="btn ghost" onClick={stopLogin}>{t("Cancel")}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <p className="muted login-note">{t("Spotify must be open somewhere for the music to play: the web player in another tab, the Spotify app on your phone or computer, or Spotify on a TV, a Chromecast, a smart speaker (Echo/Alexa) and so on. Start it once and it shows up in the device list.")}</p>
        </div>
      ) : (
        <>
          <div className="quick">
            <button className="btn big" data-pad-first data-pad-quick disabled={!canStart || busy} title={t("Play with the last settings")} onClick={() => create()}>⚡ {t("Quickstart")}<PadHint button="y" /></button>
          </div>
          <section className="card">
            <h2>{t("Playlists")} {picked.length > 0 && <small className="muted">({t("{n} selected", { n: picked.length })})</small>}</h2>
            <p className="muted pl-note">{t("Pick the playlists for the next game. Manage your playlists on Spotify.")} <a className="sp-link" href="https://open.spotify.com/collection/playlists" target="_blank" rel="noreferrer" aria-label={t("Open your playlists on Spotify")} title={t("Open Spotify")}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1DB954" /><g fill="none" stroke="#000" strokeLinecap="round"><path d="M5.6 9.2c4.2-1.2 8.8-.8 12.8 1.4" strokeWidth="2.2" /><path d="M6.4 12.6c3.5-1 7.3-.7 10.6 1.1" strokeWidth="1.8" /><path d="M7.2 15.6c2.8-.8 5.7-.5 8.4.9" strokeWidth="1.5" /></g></svg></a></p>
            <div className="grid">
              {playlists.map((p) => (
                <button key={p.id} className={"pl" + (picked.includes(p.id) ? " sel" : "")} onClick={() => toggle(p.id)}>
                  {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                  <Marquee text={p.name} /><small>{t("{n} tracks", { n: p.tracks })}</small>
                </button>
              ))}
            </div>
          </section>
          {options}
        </>
      )}
    </main>
  );
}

function Game({ saved, onLeave, solo }: { saved: Saved; onLeave: () => void; solo?: boolean }) {
  const first = useMemo(() => ({ t: "host" as const, code: saved.code, token: saved.token }), [saved]);
  const ytRun = useRef<(c: PlayerCommand) => void>();
  const { state, error, send, endsAt, guessEndsAt } = useRoom(first, (m) => { if (m.t === "player") ytRun.current?.(m.cmd); });
  const [ytError, setYtError] = useState("");
  const yt = useYouTubePlayer(!!saved.youtube, (msg) => { setYtError(msg); setTimeout(() => setYtError(""), 7000); });
  ytRun.current = yt.run;
  const [mute, setMute] = useState(false);
  const [askQuit, setAskQuit] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null); // the left part of the status bar, filled by the round screen
  useScrollTop(state?.phase ?? "");
  const prev = useRef<RoomState["phase"]>();
  const joinUrl = `${location.origin}/?code=${saved.code}`;
  // optional: the host device plays too
  const [me, setMe] = useState<{ name: string; playerId?: string } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem("tg_hostplayer") ?? "null"); } catch { return null; }
  });
  const saveMe = (m: { name: string; playerId?: string } | null) => {
    setMe(m);
    if (m) sessionStorage.setItem("tg_hostplayer", JSON.stringify(m)); else sessionStorage.removeItem("tg_hostplayer");
  };

  useEffect(() => { setMuted(mute); }, [mute]);
  // solo: no lobby, the game starts as soon as this screen's player has joined
  useEffect(() => { if (solo && state?.phase === "lobby" && state.players.length > 0) send({ t: "start" }); }, [solo, state?.phase, state?.players.length]);
  useEffect(() => {
    if (!state || prev.current === state.phase) return;
    if (state.phase === "playing") sfx.start();
    if (state.phase === "reveal") sfx.reveal();
    if (state.phase === "finished") sfx.win();
    prev.current = state.phase;
  }, [state?.phase]);

  const joined = useRef(0);
  useEffect(() => {
    if (!state) return;
    if (state.players.length > joined.current) sfx.join();
    joined.current = state.players.length;
  }, [state?.players.length]);

  // tell the host when a player leaves, loses connection or comes back
  const [notice, setNotice] = useState("");
  const prevPlayers = useRef<Map<string, { name: string; connected: boolean }>>(new Map());
  useEffect(() => {
    if (!state) return;
    const prev = prevPlayers.current;
    const msgs: string[] = [];
    const ids = new Set(state.players.map((p) => p.id));
    for (const [id, o] of prev) if (!ids.has(id) && id !== me?.playerId) msgs.push(t("{name} left the game", { name: o.name }));
    for (const p of state.players) {
      const o = prev.get(p.id);
      if (!o || p.id === me?.playerId) continue;
      if (o.connected && !p.connected) msgs.push(t("{name} left or lost connection", { name: p.name }));
      else if (!o.connected && p.connected) msgs.push(t("{name} is back", { name: p.name }));
    }
    prevPlayers.current = new Map(state.players.map((p) => [p.id, { name: p.name, connected: p.connected }]));
    if (msgs.length) {
      setNotice(msgs.join(" · "));
      const t = setTimeout(() => setNotice(""), 7000);
      return () => clearTimeout(t);
    }
  }, [state?.players]);

  // keyboard / gamepad: Alt+P or Start pause, Alt+S or Select skip, Enter or A = next song at the reveal
  const phaseRef = useRef(state?.phase);
  phaseRef.current = state?.phase;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey && e.code === "KeyP") { e.preventDefault(); send({ t: "pause" }); }
      else if (e.altKey && e.code === "KeyS") { e.preventDefault(); send({ t: "skip" }); }
      else if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey && phaseRef.current === "reveal" && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t?.tagName ?? "")) send({ t: "next" });
    };
    window.addEventListener("keydown", onKey);
    const off = onPadButton((b) => {
      if (b === "start") send({ t: "pause" });
      else if (b === "select") send({ t: "skip" });
      else if (b === "a" && phaseRef.current === "reveal") send({ t: "next" });
    });
    return () => { window.removeEventListener("keydown", onKey); off(); };
  }, [send]);

  const quit = () => { send({ t: "quit" }); onLeave(); }; // also stops the music
  if (error && !state) return <ErrorPage error={error} onBack={onLeave} host />;
  if (!state) return <main className="screen center"><p className="muted">{t("Connecting…")}</p></main>;

  return (
    <main className="screen game" data-pad-game={state.phase === "playing" || state.phase === "reveal" ? "" : undefined}>
      <header className="statusbar">
        <div className="sb-left" ref={setSlot} />
        <div className="sb-right">
          <button className="mute" onClick={() => setMute(!mute)} aria-label={t("Toggle sound")}>{mute ? "🔇" : "🔊"}</button>
          <MicToggle className="micbtn" />
          {!saved.youtube && <DevicePicker onPick={(deviceId) => send({ t: "device", deviceId })} />}
          <SettingsMenu />
          <button className="quit" onClick={() => { if (state.phase === "lobby" || state.phase === "finished") quit(); else setAskQuit(true); }} aria-label={t("Quit game")} title={t("Quit game")}>✕</button>
        </div>
      </header>
      <PadMenuHint inGame={state.phase === "playing" || state.phase === "reveal"} />
      {state.phase === "lobby" && solo && <main className="center"><p className="muted">{t("Starting…")}</p></main>}
      {state.phase === "lobby" && !solo && <Lobby state={state} joinUrl={joinUrl} me={me} onPlay={(name) => saveMe({ name })} onStart={() => send({ t: "start" })} onLeave={quit} />}
      {state.phase === "playing" && <Playing send={send} slot={slot} follow={saved.youtube ? yt.follow : undefined} state={state} endsAt={endsAt} guessEndsAt={guessEndsAt} onSkip={() => send({ t: "skip" })} onPause={() => send({ t: "pause" })} />}
      {state.phase === "reveal" && <Reveal state={state} send={send} onNext={() => send({ t: "next" })} />}
      {state.phase === "finished" && <Finished state={state} onLeave={quit} />}
      {me && <Play embedded hostToken={saved.token} saved={{ code: saved.code, name: me.name, playerId: me.playerId }} onLeave={() => saveMe(null)} onId={(playerId) => saveMe({ ...me, playerId })} />}
      {notice && <p className="notice toast" role="status">{notice}</p>}
      {(error || ytError) && <p className="error toast">{error || ytError}</p>}
      {yt.element}
      {askQuit && <Confirm message={t("Quit the game for everyone?")} confirmLabel={t("Quit game")} onCancel={() => setAskQuit(false)} onConfirm={quit} />}
    </main>
  );
}

/** Tells a gamepad user which button reaches the corner buttons. */
function PadMenuHint({ inGame }: { inGame: boolean }) {
  const { connected } = usePad();
  return connected ? <div className="padmenu-hint"><Glyph button={inGame ? "lb" : "select"} /></div> : null;
}

/** Top-right button: choose which Spotify device plays the music, also during a game. */
function DevicePicker({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const load = () => fetch("/api/devices").then((r) => r.json()).then((d) => setDevices(Array.isArray(d) ? d : [])).catch(() => setDevices([]));
  return (
    <>
      <button className="devbtn" onClick={() => { const o = !open; setOpen(o); if (o) { setDevices(null); void load(); } }} aria-label={t("Play on device")} aria-expanded={open} title={t("Play on device")}><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1DB954" /><g fill="none" stroke="#000" strokeLinecap="round"><path d="M5.6 9.2c4.2-1.2 8.8-.8 12.8 1.4" strokeWidth="2.2" /><path d="M6.4 12.6c3.5-1 7.3-.7 10.6 1.1" strokeWidth="1.8" /><path d="M7.2 15.6c2.8-.8 5.7-.5 8.4.9" strokeWidth="1.5" /></g></svg></button>
      {open && (
        <div className="settings card devices" role="dialog" aria-label={t("Play on")}>
          <h2>{t("Play on")}</h2>
          {devices === null ? <p className="muted">{t("Looking for devices…")}</p> : devices.length === 0 ? <p className="muted">{t("No device found. Open Spotify somewhere.")}</p> : (
            <ul>
              {devices.map((d) => (
                <li key={d.id}><button className={"btn ghost" + (d.active ? " voted" : "")} onClick={() => { onPick(d.id); setTimeout(load, 1500); }}>{d.active ? "● " : ""}{d.name} <small className="muted">({d.type})</small></button></li>
              ))}
            </ul>
          )}
          <button className="btn ghost" onClick={load}>{t("Refresh")}</button>
          <button className="btn ghost" onClick={() => setOpen(false)}>{t("Close")}</button>
        </div>
      )}
    </>
  );
}

function Lobby({ state, joinUrl, me, onPlay, onStart, onLeave }: { state: RoomState; joinUrl: string; me: { name: string } | null; onPlay: (name: string) => void; onStart: () => void; onLeave: () => void }) {
  const [qr, setQr] = useState("");
  const [name, setName] = useState("");
  useEffect(() => { QRCode.toDataURL(joinUrl, { margin: 1, width: 280, color: { dark: "#0b0b1a", light: "#ffffff" } }).then(setQr); }, [joinUrl]);
  return (
    <div className="lobby">
      <div className="card center">
        <Logo small />
        <p className="muted">{t("Join at")} <b>{location.host}</b> {t("with code")}</p>
        <div className="code">{state.code.split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 80}ms` }}>{c}</span>)}</div>
        {qr && <img className="qr" src={qr} alt={t("Scan to join")} />}
      </div>
      <div className="card">
        <h2>{t("Players")} {state.players.length}/4</h2>
        <ul className="players">
          {state.players.map((p, i) => <li key={p.id} className={"pop c" + (i % 4)} style={{ opacity: p.connected ? 1 : 0.4 }}>{p.name}</li>)}
          {state.players.length === 0 && <li className="muted">{t("Waiting for players…")}</li>}
        </ul>
        <GameSummary state={state} />
        {me ? <p className="muted">{t("You're playing as")} <b>{me.name}</b> {t("on this screen.")}</p> : (
          <form className="hostplay" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { sfx.join(); onPlay(name.trim()); } }}>
            <input placeholder={t("Play on this screen too? Your name")} maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim() || state.players.length >= 4}>{t("Join")}</button>
          </form>
        )}
        <button className="btn big" data-pad-first disabled={state.players.length === 0} onClick={onStart}>{t("Start game")}<PadHint button="a" focusOnly /></button>
        <button className="btn ghost" onClick={onLeave}>{t("Cancel")}</button>
      </div>
    </div>
  );
}

function Playing({ send, slot, follow, state, endsAt, guessEndsAt, onSkip, onPause }: { slot: HTMLElement | null; follow?: (el: HTMLElement | null, progress?: number) => void; state: RoomState; endsAt: number; guessEndsAt: number; onSkip: () => void; onPause: () => void; send: (m: ClientMessage) => unknown }) {
  const guessing = !!state.guesser;
  const left = useCountdown(endsAt, guessing || state.paused ? state.remainingMs : undefined);
  const unlimited = state.roundMs === null;
  const frac = unlimited ? 1 : Math.min(1, left / (state.roundMs! / 1000));
  const lastTick = useRef(-1);
  useEffect(() => {
    const s = Math.ceil(left);
    if (!unlimited && !guessing && s <= 5 && s > 0 && s !== lastTick.current) { lastTick.current = s; sfx.tick(); }
  }, [left, guessing]);
  const gid = state.guesser?.id;
  useEffect(() => { if (gid) sfx.buzz(); }, [gid]);
  const foundCount = (state.found?.title ? 1 : 0) + (state.found?.artist ? 1 : 0);
  const prevFound = useRef(0);
  useEffect(() => { if (foundCount > prevFound.current) sfx.correct(); prevFound.current = foundCount; }, [foundCount]);
  // YouTube: the video itself, pixelated, is the artwork hint
  const videoSlot = useRef<HTMLDivElement>(null);
  const artProgress = state.art?.progress;
  useEffect(() => {
    if (!follow) return;
    follow(artProgress !== undefined ? videoSlot.current : null, artProgress);
    return () => follow(null);
  }, [follow, artProgress]);
  const R = 90, C = 2 * Math.PI * R;
  return (
    <div className={"p2" + (state.art ? " with-art" : "")}>
      {slot && createPortal(<>
          {!guessing && (
            <div className="ctl">
              <span className="icon-wrap">
                <button className="icon-btn" onClick={onPause} aria-label={state.paused ? t("Continue") : t("Pause")} title={state.paused ? t("Continue") : t("Pause")}>{state.paused ? "▶" : "⏸"}</button>
                <PadHint button="start" />
              </span>
              <small />
            </div>
          )}
          <div className="ctl">
            <span className="icon-wrap">
              <button className={"icon-btn" + (state.skip?.host ? " voted" : "")} onClick={onSkip} aria-label={t("Skip song")} title={t("Skip song")}>⏭</button>
              <PadHint button="select" />
            </span>
            <small>{state.skip && state.skip.voters > 1 && state.skip.votes > 0 ? `(${state.skip.votes}/${state.skip.voters})` : ""}</small>
          </div>
        <span className="rl">{roundLabel(state)}<b className="rl-secs">{unlimited ? "∞" : `${Math.ceil(left)}s`}</b><GameTimer state={state} /></span>
        <ScoreLine state={state} />
      </>, slot)}
      <div className="p2-eq" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} className={guessing || state.paused ? "still" : ""} style={{ animationDelay: `${(i * 97) % 600}ms` }} />)}</div>
      <div className="vbar" aria-hidden="true"><i style={{ height: `${frac * 100}%` }} /></div>
      <div className={"timer p2-timer" + (!unlimited && left <= 5 && !guessing ? " hot" : "") + (guessing ? " frozen" : "")}>
        <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r={R} className="track" /><circle cx="100" cy="100" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} /></svg>
        <b>{unlimited ? "∞" : Math.ceil(left)}</b>
      </div>
      <div className="p2-hint">
        {state.paused && <p className="paused-banner">{t("⏸ PAUSED")}</p>}
        {guessing && <p className="guessing-line">🎤 {t("{name} is guessing…", { name: state.guesser!.name })}</p>}
        {state.config.order === "roundRobin" && state.activePlayerId && !guessing && <p className="turn">🎯 {t("{name}'s song", { name: state.players.find((p) => p.id === state.activePlayerId)?.name ?? "" })}</p>}
        <FoundChips found={state.found} guess={state.config.guess} hint={state.hint} />
        <Hints state={state} />
        <ScoreBanner state={state} />
      </div>
      {state.art && <div className="p2-art">{follow ? <div className="yt-slot" ref={videoSlot} /> : <PixelArt url={state.art.url} progress={state.art.progress} />}<VoteButtons round={state.round} send={send} /></div>}
      {guessing && <div className="p2-bar"><GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} /></div>}
    </div>
  );
}

function roundLabel(state: RoomState) {
  return state.config.playTo.kind === "score"
    ? t("Round {n} · first to {target}", { n: state.round, target: state.config.playTo.target })
    : t("Round {n} / {total}", { n: state.round, total: state.totalRounds ?? state.config.playTo.rounds });
}

function Reveal({ state, onNext, send }: { state: RoomState; onNext: () => void; send: (m: ClientMessage) => unknown }) {
  const r = state.reveal!;
  return (
    <div className="reveal">
      <div className="top">
        <div className="top-main">
          {r.albumArt && <img className="art spin-in" src={r.albumArt} alt="" />}
          <h1 className="rv-title">{r.title}</h1>
          <h2 className="rv-artist">{r.artists.join(", ")}{r.year ? ` · ${r.year}` : ""}</h2>
          <VoteButtons round={state.round} send={send} />
        </div>
        <div className="top-side">
          <GameTimer state={state} />
          <ScoreBanner state={state} bare />
          <Scoreboard state={state} reveal={r} />
        </div>
      </div>
      {state.awaitingNext && <p className="waiting">{t("The song keeps playing. The next round starts when it ends, or when you continue.")}</p>}
      <button className="btn next-btn" onClick={onNext}>{state.totalRounds !== undefined && state.round >= state.totalRounds ? t("Final results") : t("Next song")}<PadHint button="a" /></button>
    </div>
  );
}

function Finished({ state, onLeave }: { state: RoomState; onLeave: () => void }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const ms = useGameClock(state);
  return (
    <div className="finished center">
      <h1 className="logo">{t("{name} wins! 🏆", { name: sorted[0]?.name ?? "" })}</h1>
      <ol className="podium">
        {sorted.map((p, i) => <li key={p.id} className={"pop p" + i} style={{ animationDelay: `${(sorted.length - i) * 250}ms` }}><b>{i + 1}</b><span>{p.name}</span><em>{p.score}</em></li>)}
      </ol>
      {ms !== null && <p className="muted finish-time">{t("Time: {time}", { time: fmtTime(ms) })}</p>}
      <HighScoreTable state={state} />
      <button className="btn big" onClick={onLeave}>{t("New game")}</button>
    </div>
  );
}
