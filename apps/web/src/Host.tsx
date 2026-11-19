import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { DEFAULT_CONFIG, sanitizeConfig, type GameConfig, type PlayerCommand, type RoomState } from "@tuneguesser/shared";
import { FoundChips, GameSummary, GuessBar, Hints, PixelArt, ScoreBanner } from "./Found";
import { ScoreLine, Scoreboard } from "./Scoreboard";
import { SettingsMenu } from "./Settings";
import { useCountdown, useRoom, useScrollTop } from "./net";
import { Play } from "./Player";
import { setMuted, sfx } from "./sfx";
import { Glyph, PadHint } from "./input/Glyph";
import { Logo } from "./Logo";
import { ErrorPage } from "./ErrorPage";
import { MicToggle } from "./input/Mic";
import { Confirm } from "./input/Confirm";
import { useYouTubePlayer } from "./YouTubePlayer";
import { onPadButton, usePad } from "./input/pad";

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
      {options.map(([v, label]) => <button type="button" key={String(v)} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}

const LAST_PLAYLISTS = "tg_playlists";
const LAST_CONFIG = "tg_config";
const readJson = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };

function Setup({ onCreated, solo, onBack }: { onCreated: (s: Saved) => void; solo?: boolean; onBack?: () => void }) {
  const [playerName, setPlayerName] = useState(() => { try { return localStorage.getItem("tg_name") || ""; } catch { return ""; } });
  const [me, setMe] = useState<{ spotify: boolean; spotifyConfigured: boolean; youtube?: boolean }>();
  // music source: Spotify (account + a playing device) or YouTube (playlist links, plays on this screen)
  const [source, setSource] = useState<"spotify" | "youtube">(() => (readJson<string>("tg_source", "spotify") === "youtube" ? "youtube" : "spotify"));
  const [ytLists, setYtLists] = useState<Array<{ id: string; name: string; tracks: number; image?: string }>>(() => readJson("tg_ytlists", []));
  const [ytInput, setYtInput] = useState("");
  const useYt = source === "youtube" && !!me?.youtube;
  const addYt = async () => {
    if (!ytInput.trim()) return;
    setErr("");
    const r = await fetch(`/api/youtube/playlist?url=${encodeURIComponent(ytInput.trim())}`);
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "Could not add that playlist");
    setYtLists((cur) => (cur.some((x) => x.id === j.id) ? cur : [...cur, j]));
    setYtInput("");
  };
  useEffect(() => { try { localStorage.setItem("tg_ytlists", JSON.stringify(ytLists)); localStorage.setItem("tg_source", JSON.stringify(source)); } catch { /* storage blocked */ } }, [ytLists, source]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [picked, setPicked] = useState<string[]>(() => readJson<string[]>(LAST_PLAYLISTS, []));
  const [deviceId, setDeviceId] = useState("");
  const [cfg, setCfg] = useState<GameConfig>(() => sanitizeConfig({ ...DEFAULT_CONFIG, ...readJson<Partial<GameConfig>>(LAST_CONFIG, {}) }));
  const canStart = useYt ? ytLists.length > 0 : picked.length > 0 && !!deviceId;
  const set = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const [err, setErr] = useState(new URLSearchParams(location.search).get("error") ? "Spotify login failed, try again." : "");
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
    } catch { setErr("Cannot reach the server"); return; }
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
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => setErr("Cannot reach the server"));
  }, []);

  const loadDevices = () => fetch("/api/devices").then((r) => r.json()).then((d: Device[]) => {
    setDevices(d);
    setDeviceId((cur) => cur || d.find((x) => x.active)?.id || d[0]?.id || "");
  }).catch(() => {});

  useEffect(() => {
    if (!me?.spotify) return;
    fetch("/api/playlists").then((r) => r.json()).then((p: Playlist[]) => {
      setPlaylists(p);
      setPicked((cur) => cur.filter((id) => p.some((x) => x.id === id))); // forget playlists that are gone
    }).catch(() => setErr("Could not load playlists"));
    void loadDevices();
  }, [me?.spotify]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const create = async (demo: boolean) => {
    setBusy(true); setErr("");
    sfx.start(); // unlocks audio on this screen
    try { localStorage.setItem(LAST_PLAYLISTS, JSON.stringify(picked)); localStorage.setItem(LAST_CONFIG, JSON.stringify(cfg)); } catch { /* storage blocked */ }
    const name = playerName.trim() || "Player";
    if (solo) {
      try { localStorage.setItem("tg_name", name); } catch { /* storage blocked */ }
      sessionStorage.setItem("tg_hostplayer", JSON.stringify({ name })); // this screen plays: the lobby is skipped
    }
    const r = await fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ demo, ...(useYt ? { source: "youtube", playlistIds: ytLists.map((l) => l.id) } : { playlistIds: picked, deviceId: deviceId || undefined }), config: solo ? { ...cfg, order: "buzzer" } : cfg }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Could not create room");
    onCreated({ code: j.code, token: j.hostToken, youtube: useYt || undefined });
  };

  const timed = cfg.roundSeconds !== null;
  const options = (
    <>
          <section className="card opts">
            {solo && <label>Your name<input value={playerName} maxLength={16} autoComplete="nickname" onChange={(e) => setPlayerName(e.target.value)} placeholder="Player" /></label>}
            <div className="opt"><span>Music plays on</span>
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} onFocus={loadDevices}>
                {devices.length === 0 && <option value="">No device found – open Spotify somewhere</option>}
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type}){d.active ? " ●" : ""}</option>)}
              </select>
            </div>
            <div className="opt"><span>Play to</span>
              <Seg value={cfg.playTo.kind} options={[["rounds", "Rounds"], ["score", "Score"]]} onChange={(k) => set({ playTo: k === "rounds" ? { kind: "rounds", rounds: 10 } : { kind: "score", target: 5000 } })} />
              {cfg.playTo.kind === "rounds"
                ? <label>Rounds <input type="number" min={1} max={100} value={cfg.playTo.rounds} onChange={(e) => set({ playTo: { kind: "rounds", rounds: +e.target.value } })} /></label>
                : <label>Target score <input type="number" min={500} max={100000} step={500} value={cfg.playTo.target} onChange={(e) => set({ playTo: { kind: "score", target: +e.target.value } })} /></label>}
            </div>
            {!solo && (
              <div className="opt"><span>Play order</span>
                <Seg value={cfg.order} options={[["buzzer", "Buzzer"], ["roundRobin", "Round robin"]]} onChange={(order) => set({ order })} />
                <small className="muted">{cfg.order === "buzzer" ? "Everyone can buzz in; the first to press ANSWER guesses." : "Players take turns: each player gets one song to guess, or skip."}</small>
              </div>
            )}
            <div className="opt"><span>Guess</span>
              <Seg value={cfg.guess} options={[["both", "Both"], ["title", "Song"], ["artist", "Artist"]]} onChange={(guess) => set({ guess })} />
              {cfg.guess !== "both" && <small className="muted">{cfg.guess === "title" ? "Only the song title counts. Handy when the playlist is one artist." : "Only the artist counts. Handy for mixed playlists where you only care who it is."}</small>}
            </div>
            <div className="opt"><span>Answers</span>
              <Seg value={cfg.answers} options={[["type", "Type"], ["choice", "Multiple choice"]]} onChange={(answers) => set({ answers })} />
              {cfg.answers === "choice" && <small className="muted">4 options, the wrong ones are other songs from the playlist(s).</small>}
            </div>
            <div className="opt"><span>Hints</span>
              <div className="seg" role="group" aria-label="Hints">
                {([["reveal", "Reveal letters"], ["trivia", "Trivia"], ["art", "Artwork"]] as const).map(([k, label]) => (
                  <button key={k} type="button" className={cfg.hints[k] ? "on" : ""} aria-pressed={cfg.hints[k]} onClick={() => set({ hints: { ...cfg.hints, [k]: !cfg.hints[k] } })}>{cfg.hints[k] ? "✓ " : ""}{label}</button>
                ))}
              </div>
              <small className="muted">{!cfg.hints.reveal && !cfg.hints.trivia && !cfg.hints.art ? "No hints." : [cfg.hints.reveal && "Reveal: underscores, letters appear after 10 s.", cfg.hints.trivia && "Trivia: facts from MusicBrainz and Wikipedia.", cfg.hints.art && "Artwork: pixelated cover that sharpens over time."].filter(Boolean).join(" ")}</small>
            </div>
            <div className="opt"><span>Song starts</span>
              <Seg value={cfg.start} options={[["random", "Random start"], ["beginning", "From the beginning"]]} onChange={(start) => set({ start })} />
            </div>
            <div className="opt"><span>Next song</span>
              <Seg value={cfg.autoAdvance} options={[[true, "Automatic"], [false, "Song end / Manually skip"]]} onChange={(autoAdvance) => set({ autoAdvance })} />
            </div>
            <div className="opt"><span>Timer</span>
              <Seg value={timed} options={[[true, "Seconds per song"], [false, "Unlimited"]]} onChange={(t) => set({ roundSeconds: t ? 40 : null })} />
              {timed && <label>Seconds <input type="number" min={10} max={120} value={cfg.roundSeconds ?? 40} onChange={(e) => set({ roundSeconds: +e.target.value })} /></label>}
              {!timed && <small className="muted">The round lasts until the song ends.</small>}
            </div>
            <div className="opt"><span>Attempts per round</span>
              <Seg value={cfg.attempts} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string])} onChange={(attempts) => set({ attempts })} />
            </div>
            <div className="opt"><span>Score multipliers</span>
              <Seg value={cfg.multipliers} options={[[true, "Yes"], [false, "No"]]} onChange={(multipliers) => set({ multipliers })} />
              <small className="muted">Extra points for song + artist at once, and for streaks.</small>
            </div>
          </section>
          <button className="btn big" disabled={!canStart || busy} onClick={() => create(false)}>{solo ? "Start the game" : "Create room"}<PadHint button="a" focusOnly /></button>
    </>
  );
  return (
    <main className="screen setup">
      {onBack && <button className="backlink" onClick={onBack}>← Menu</button>}
      <SettingsMenu apk solo />
      <Logo />
      {err && <p className="error">{err}</p>}
      {me?.youtube && (
        <div className="card source-pick"><span>Music from</span><Seg value={source} options={[["spotify", "Spotify"], ["youtube", "YouTube"]]} onChange={(v) => setSource(v)} /></div>
      )}
      {!me ? <p className="muted">Loading…</p> : useYt ? (
        <>
          <div className="quick">
            <button className="btn big" data-pad-first data-pad-quick disabled={!canStart || busy} title="Play with the last settings" onClick={() => create(false)}>⚡ Quickstart<PadHint button="y" /></button>
          </div>
          <section className="card">
            <h2>YouTube playlists {ytLists.length > 0 && <small className="muted">({ytLists.length})</small>}</h2>
            <p className="muted pl-note">Paste the link of a public or unlisted playlist (YouTube or YouTube Music). The music plays on this screen, no account needed.</p>
            <form className="yt-add" onSubmit={(e) => { e.preventDefault(); void addYt(); }}>
              <input value={ytInput} onChange={(e) => setYtInput(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…" inputMode="url" aria-label="YouTube playlist link" />
              <button className="btn" type="submit">Add</button>
            </form>
            <div className="grid">
              {ytLists.map((p) => (
                <button key={p.id} className="pl sel" onClick={() => setYtLists((cur) => cur.filter((x) => x.id !== p.id))} title="Remove">
                  {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                  <b>{p.name}</b><small>{p.tracks} videos · tap to remove</small>
                </button>
              ))}
            </div>
          </section>
          {options}
        </>
      ) : !me.spotify ? (
        <div className="card center">
          <p>Log in with the Spotify account that will play the music (Premium required).</p>
          {me.spotifyConfigured ? <a className="btn big" href="/api/auth/login" data-pad-first onClick={appLogin}>Log in with Spotify<PadHint button="a" focusOnly /></a> : <p className="error">Server has no SPOTIFY_CLIENT_ID.</p>}
          {pairing && (
            <div className="pairing-overlay padtext" role="dialog" aria-label="Log in on another device">
              <div className="card pairing">
                <h2>Log in to Spotify on another device</h2>
                <div className="pairing-body">
                  <img src={pairing.qr} alt="QR code to log in" className="qr" />
                  <div className="pairing-side">
                    <p>Scan the code with your phone, or open <b>{pairing.url.replace(/^https?:\/\//, "")}</b></p>
                    <p className="muted">Log in to Spotify there (Premium). This screen continues by itself.</p>
                    <button className="btn" data-pad-first onClick={openHere}>Use this device's browser</button>
                    <button className="btn ghost" onClick={stopLogin}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <p className="muted login-note">Spotify must be open somewhere for the music to play: the web player in another tab, the Spotify app on your phone or computer, or Spotify on a TV, a Chromecast, a smart speaker (Echo/Alexa) and so on. Start it once and it shows up in the device list.</p>
          <button className="btn ghost" disabled={busy} onClick={() => create(true)}>Try demo mode (no music)</button>
        </div>
      ) : (
        <>
          <div className="quick">
            <button className="btn big" data-pad-first data-pad-quick disabled={!canStart || busy} title="Play with the last settings" onClick={() => create(false)}>⚡ Quickstart<PadHint button="y" /></button>
          </div>
          <section className="card">
            <h2>Playlists {picked.length > 0 && <small className="muted">({picked.length} selected)</small>}</h2>
            <p className="muted pl-note">Pick the playlists for the next game. Manage your playlists on Spotify. <a className="sp-link" href="https://open.spotify.com/collection/playlists" target="_blank" rel="noreferrer" aria-label="Open your playlists on Spotify" title="Open Spotify"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1DB954" /><g fill="none" stroke="#000" strokeLinecap="round"><path d="M5.6 9.2c4.2-1.2 8.8-.8 12.8 1.4" strokeWidth="2.2" /><path d="M6.4 12.6c3.5-1 7.3-.7 10.6 1.1" strokeWidth="1.8" /><path d="M7.2 15.6c2.8-.8 5.7-.5 8.4.9" strokeWidth="1.5" /></g></svg></a></p>
            <div className="grid">
              {playlists.map((p) => (
                <button key={p.id} className={"pl" + (picked.includes(p.id) ? " sel" : "")} onClick={() => toggle(p.id)}>
                  {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                  <b>{p.name}</b><small>{p.tracks} tracks</small>
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
    for (const [id, o] of prev) if (!ids.has(id) && id !== me?.playerId) msgs.push(`${o.name} left the game`);
    for (const p of state.players) {
      const o = prev.get(p.id);
      if (!o || p.id === me?.playerId) continue;
      if (o.connected && !p.connected) msgs.push(`${p.name} left or lost connection`);
      else if (!o.connected && p.connected) msgs.push(`${p.name} is back`);
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
  if (!state) return <main className="screen center"><p className="muted">Connecting…</p></main>;

  return (
    <main className="screen game" data-pad-game={state.phase === "playing" || state.phase === "reveal" ? "" : undefined}>
      <header className="statusbar">
        <div className="sb-left" ref={setSlot} />
        <div className="sb-right">
          <button className="mute" onClick={() => setMute(!mute)} aria-label="Toggle sound">{mute ? "🔇" : "🔊"}</button>
          <MicToggle className="micbtn" />
          {!saved.youtube && <DevicePicker onPick={(deviceId) => send({ t: "device", deviceId })} />}
          <SettingsMenu />
          <button className="quit" onClick={() => { if (state.phase === "lobby" || state.phase === "finished") quit(); else setAskQuit(true); }} aria-label="Quit game" title="Quit game">✕</button>
        </div>
      </header>
      <PadMenuHint inGame={state.phase === "playing" || state.phase === "reveal"} />
      {state.phase === "lobby" && solo && <main className="center"><p className="muted">Starting…</p></main>}
      {state.phase === "lobby" && !solo && <Lobby state={state} joinUrl={joinUrl} me={me} onPlay={(name) => saveMe({ name })} onStart={() => send({ t: "start" })} onLeave={quit} />}
      {state.phase === "playing" && <Playing slot={slot} state={state} endsAt={endsAt} guessEndsAt={guessEndsAt} onSkip={() => send({ t: "skip" })} onPause={() => send({ t: "pause" })} />}
      {state.phase === "reveal" && <Reveal state={state} onNext={() => send({ t: "next" })} />}
      {state.phase === "finished" && <Finished state={state} onLeave={quit} />}
      {me && <Play embedded hostToken={saved.token} saved={{ code: saved.code, name: me.name, playerId: me.playerId }} onLeave={() => saveMe(null)} onId={(playerId) => saveMe({ ...me, playerId })} />}
      {notice && <p className="notice toast" role="status">{notice}</p>}
      {(error || ytError) && <p className="error toast">{error || ytError}</p>}
      {yt.element}
      {askQuit && <Confirm message="Quit the game for everyone?" confirmLabel="Quit game" onCancel={() => setAskQuit(false)} onConfirm={quit} />}
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
  const load = () => fetch("/api/devices").then((r) => r.json()).then(setDevices).catch(() => setDevices([]));
  return (
    <>
      <button className="devbtn" onClick={() => { const o = !open; setOpen(o); if (o) { setDevices(null); void load(); } }} aria-label="Play on device" aria-expanded={open} title="Play on device"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1DB954" /><g fill="none" stroke="#000" strokeLinecap="round"><path d="M5.6 9.2c4.2-1.2 8.8-.8 12.8 1.4" strokeWidth="2.2" /><path d="M6.4 12.6c3.5-1 7.3-.7 10.6 1.1" strokeWidth="1.8" /><path d="M7.2 15.6c2.8-.8 5.7-.5 8.4.9" strokeWidth="1.5" /></g></svg></button>
      {open && (
        <div className="settings card devices" role="dialog" aria-label="Play on">
          <h2>Play on</h2>
          {devices === null ? <p className="muted">Looking for devices…</p> : devices.length === 0 ? <p className="muted">No device found. Open Spotify somewhere.</p> : (
            <ul>
              {devices.map((d) => (
                <li key={d.id}><button className={"btn ghost" + (d.active ? " voted" : "")} onClick={() => { onPick(d.id); setTimeout(load, 1500); }}>{d.active ? "● " : ""}{d.name} <small className="muted">({d.type})</small></button></li>
              ))}
            </ul>
          )}
          <button className="btn ghost" onClick={load}>Refresh</button>
          <button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
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
        <p className="muted">Join at <b>{location.host}</b> with code</p>
        <div className="code">{state.code.split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 80}ms` }}>{c}</span>)}</div>
        {qr && <img className="qr" src={qr} alt="Scan to join" />}
      </div>
      <div className="card">
        <h2>Players {state.players.length}/4</h2>
        <ul className="players">
          {state.players.map((p, i) => <li key={p.id} className={"pop c" + (i % 4)} style={{ opacity: p.connected ? 1 : 0.4 }}>{p.name}</li>)}
          {state.players.length === 0 && <li className="muted">Waiting for players…</li>}
        </ul>
        <GameSummary state={state} />
        {me ? <p className="muted">You're playing as <b>{me.name}</b> on this screen.</p> : (
          <form className="hostplay" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { sfx.join(); onPlay(name.trim()); } }}>
            <input placeholder="Play on this screen too? Your name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim() || state.players.length >= 4}>Join</button>
          </form>
        )}
        <button className="btn big" data-pad-first disabled={state.players.length === 0} onClick={onStart}>Start game<PadHint button="a" focusOnly /></button>
        <button className="btn ghost" onClick={onLeave}>Cancel</button>
      </div>
    </div>
  );
}

function Playing({ slot, state, endsAt, guessEndsAt, onSkip, onPause }: { slot: HTMLElement | null; state: RoomState; endsAt: number; guessEndsAt: number; onSkip: () => void; onPause: () => void }) {
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
  const R = 90, C = 2 * Math.PI * R;
  return (
    <div className={"p2" + (state.art ? " with-art" : "")}>
      {slot && createPortal(<>
          {!guessing && (
            <div className="ctl">
              <span className="icon-wrap">
                <button className="icon-btn" onClick={onPause} aria-label={state.paused ? "Continue" : "Pause"} title={state.paused ? "Continue" : "Pause"}>{state.paused ? "▶" : "⏸"}</button>
                <PadHint button="start" />
              </span>
              <small />
            </div>
          )}
          <div className="ctl">
            <span className="icon-wrap">
              <button className={"icon-btn" + (state.skip?.host ? " voted" : "")} onClick={onSkip} aria-label="Skip song" title="Skip song">⏭</button>
              <PadHint button="select" />
            </span>
            <small>{state.skip && state.skip.voters > 1 && state.skip.votes > 0 ? `(${state.skip.votes}/${state.skip.voters})` : ""}</small>
          </div>
        <span className="rl">{roundLabel(state)}<b className="rl-secs">{unlimited ? "∞" : `${Math.ceil(left)}s`}</b></span>
        <ScoreLine state={state} />
      </>, slot)}
      <div className="p2-eq" aria-hidden>{Array.from({ length: 16 }, (_, i) => <i key={i} className={guessing || state.paused ? "still" : ""} style={{ animationDelay: `${(i * 97) % 600}ms` }} />)}</div>
      <div className="vbar" aria-hidden="true"><i style={{ height: `${frac * 100}%` }} /></div>
      <div className={"timer p2-timer" + (!unlimited && left <= 5 && !guessing ? " hot" : "") + (guessing ? " frozen" : "")}>
        <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r={R} className="track" /><circle cx="100" cy="100" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} /></svg>
        <b>{unlimited ? "∞" : Math.ceil(left)}</b>
      </div>
      <div className="p2-hint">
        {state.paused && <p className="paused-banner">⏸ PAUSED</p>}
        {guessing && <p className="guessing-line">🎤 {state.guesser!.name} is guessing…</p>}
        {state.config.order === "roundRobin" && state.activePlayerId && !guessing && <p className="turn">🎯 {state.players.find((p) => p.id === state.activePlayerId)?.name}'s song</p>}
        <FoundChips found={state.found} guess={state.config.guess} hint={state.hint} />
        <Hints state={state} />
        <ScoreBanner state={state} />
      </div>
      {state.art && <div className="p2-art"><PixelArt url={state.art.url} progress={state.art.progress} /></div>}
      {guessing && <div className="p2-bar"><GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} /></div>}
    </div>
  );
}

function roundLabel(state: RoomState) {
  return state.config.playTo.kind === "score"
    ? `Round ${state.round} · first to ${state.config.playTo.target}`
    : `Round ${state.round} / ${state.totalRounds ?? state.config.playTo.rounds}`;
}

function Reveal({ state, onNext }: { state: RoomState; onNext: () => void }) {
  const r = state.reveal!;
  return (
    <div className="reveal">
      <div className="top">
        <div className="top-main">
          {r.albumArt && <img className="art spin-in" src={r.albumArt} alt="" />}
          <h1 className="rv-title">{r.title}</h1>
          <h2 className="rv-artist">{r.artists.join(", ")}{r.year ? ` · ${r.year}` : ""}</h2>
        </div>
        <div className="top-side">
          <ScoreBanner state={state} bare />
          <Scoreboard state={state} reveal={r} />
        </div>
      </div>
      {state.awaitingNext && <p className="waiting">The song keeps playing. The next round starts when it ends, or when you continue.</p>}
      <button className="btn next-btn" onClick={onNext}>{state.totalRounds !== undefined && state.round >= state.totalRounds ? "Final results" : "Next song"}<PadHint button="a" /></button>
    </div>
  );
}

function Finished({ state, onLeave }: { state: RoomState; onLeave: () => void }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <div className="finished center">
      <h1 className="logo">{sorted[0]?.name} wins! 🏆</h1>
      <ol className="podium">
        {sorted.map((p, i) => <li key={p.id} className={"pop p" + i} style={{ animationDelay: `${(sorted.length - i) * 250}ms` }}><b>{i + 1}</b><span>{p.name}</span><em>{p.score}</em></li>)}
      </ol>
      <button className="btn big" onClick={onLeave}>New game</button>
    </div>
  );
}
