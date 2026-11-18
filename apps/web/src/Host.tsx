import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { DEFAULT_CONFIG, type GameConfig, type RoomState } from "@tuneguesser/shared";
import { FoundChips, GameSummary, GuessBar, Hints, ScoreBanner } from "./Found";
import { Scoreboard } from "./Scoreboard";
import { HostSettings } from "./Settings";
import { useCountdown, useRoom } from "./net";
import { Play } from "./Player";
import { setMuted, sfx } from "./sfx";
import { PadHint } from "./input/Glyph";
import { onPadButton } from "./input/pad";

interface Playlist { id: string; name: string; tracks: number; image?: string }
interface Device { id: string; name: string; type: string; active: boolean }
interface Saved { code: string; token: string }

const load = (): Saved | null => {
  try { return JSON.parse(sessionStorage.getItem("tg_room") ?? "null"); } catch { return null; }
};

export function Host({ onInGame }: { onInGame?: (v: boolean) => void }) {
  const [saved, setSaved] = useState<Saved | null>(load);
  useEffect(() => onInGame?.(!!saved), [!!saved]);
  return saved ? (
    <Game saved={saved} onLeave={() => { sessionStorage.removeItem("tg_room"); setSaved(null); }} />
  ) : (
    <Setup onCreated={(s) => { sessionStorage.setItem("tg_room", JSON.stringify(s)); setSaved(s); }} />
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

function Setup({ onCreated }: { onCreated: (s: Saved) => void }) {
  const [me, setMe] = useState<{ spotify: boolean; spotifyConfigured: boolean }>();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [picked, setPicked] = useState<string[]>(() => readJson<string[]>(LAST_PLAYLISTS, []));
  const [deviceId, setDeviceId] = useState("");
  const [cfg, setCfg] = useState<GameConfig>(() => ({ ...DEFAULT_CONFIG, ...readJson<Partial<GameConfig>>(LAST_CONFIG, {}) }));
  const set = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const [err, setErr] = useState(new URLSearchParams(location.search).get("error") ? "Spotify login failed, try again." : "");
  const [busy, setBusy] = useState(false);

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
    const r = await fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ demo, playlistIds: picked, deviceId: deviceId || undefined, config: cfg }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Could not create room");
    onCreated({ code: j.code, token: j.hostToken });
  };

  const timed = cfg.roundSeconds !== null;
  return (
    <main className="screen setup">
      <HostSettings autoAdvance={cfg.autoAdvance} onAutoAdvance={(v) => set({ autoAdvance: v })} />
      <h1 className="logo">Tune<span>Guesser</span></h1>
      {err && <p className="error">{err}</p>}
      {!me ? <p className="muted">Loading…</p> : !me.spotify ? (
        <div className="card center">
          <p>Log in with the Spotify account that will play the music (Premium required).</p>
          {me.spotifyConfigured ? <a className="btn big" href="/api/auth/login" data-pad-first>Log in with Spotify<PadHint button="a" focusOnly /></a> : <p className="error">Server has no SPOTIFY_CLIENT_ID.</p>}
          <button className="btn ghost" disabled={busy} onClick={() => create(true)}>Try demo mode (no music)</button>
        </div>
      ) : (
        <>
          <div className="quick">
            <button className="btn big" data-pad-first data-pad-quick disabled={picked.length === 0 || !deviceId || busy} onClick={() => create(false)}>⚡ Quickstart<PadHint button="y" /></button>
            <small className="muted">{picked.length === 0 ? "Choose playlists below once; Quickstart then reuses your last playlists and settings." : `Starts a game with your last settings (${picked.length} playlist${picked.length > 1 ? "s" : ""}) and creates the room.`}</small>
          </div>
          <section className="card">
            <h2>Playlists {picked.length > 0 && <small className="muted">({picked.length} selected)</small>}</h2>
            <p className="muted">Pick one or more. Only playlists you own or collaborate on can be used (a Spotify rule). To use someone else's or an editorial playlist, copy its songs into one of your own.</p>
            <div className="grid">
              {playlists.map((p) => (
                <button key={p.id} className={"pl" + (picked.includes(p.id) ? " sel" : "")} onClick={() => toggle(p.id)}>
                  {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                  <b>{p.name}</b><small>{p.tracks} tracks</small>
                </button>
              ))}
            </div>
          </section>
          <section className="card opts">
            <label>Play on
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} onFocus={loadDevices}>
                {devices.length === 0 && <option value="">No device found – open Spotify somewhere</option>}
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type}){d.active ? " ●" : ""}</option>)}
              </select>
            </label>
            <div className="opt"><span>Play to</span>
              <Seg value={cfg.playTo.kind} options={[["rounds", "Rounds"], ["score", "Score"]]} onChange={(k) => set({ playTo: k === "rounds" ? { kind: "rounds", rounds: 10 } : { kind: "score", target: 5000 } })} />
              {cfg.playTo.kind === "rounds"
                ? <label>Rounds <input type="number" min={1} max={100} value={cfg.playTo.rounds} onChange={(e) => set({ playTo: { kind: "rounds", rounds: +e.target.value } })} /></label>
                : <label>Target score <input type="number" min={500} max={100000} step={500} value={cfg.playTo.target} onChange={(e) => set({ playTo: { kind: "score", target: +e.target.value } })} /></label>}
            </div>
            <div className="opt"><span>Play order</span>
              <Seg value={cfg.order} options={[["buzzer", "Buzzer"], ["roundRobin", "Round robin"]]} onChange={(order) => set({ order })} />
              <small className="muted">{cfg.order === "buzzer" ? "Everyone can buzz in; the first to press ANSWER guesses." : "Players take turns: each player gets one song to guess, or skip."}</small>
            </div>
            <div className="opt"><span>Guess</span>
              <Seg value={cfg.guess} options={[["both", "Both"], ["title", "Song"], ["artist", "Artist"]]} onChange={(guess) => set({ guess })} />
              {cfg.guess !== "both" && <small className="muted">{cfg.guess === "title" ? "Only the song title counts. Handy when the playlist is one artist." : "Only the artist counts. Handy for mixed playlists where you only care who it is."}</small>}
            </div>
            <div className="opt"><span>Answers</span>
              <Seg value={cfg.answers} options={[["type", "Type"], ["choice", "Multiple choice"]]} onChange={(answers) => set({ answers })} />
              {cfg.answers === "choice" && <small className="muted">4 options, the wrong ones are other songs from the playlist(s).</small>}
            </div>
            <div className="opt"><span>Hints</span>
              <Seg value={cfg.hints} options={[["none", "None"], ["reveal", "Reveal"], ["trivia", "Trivia"]]} onChange={(hints) => set({ hints })} />
              <small className="muted">{cfg.hints === "reveal" ? "Underscores for each letter, slowly revealed as the timer runs." : cfg.hints === "trivia" ? "Facts about the artist and song appear over time (from MusicBrainz and Wikipedia)." : ""}</small>
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
          <button className="btn big" disabled={picked.length === 0 || !deviceId || busy} onClick={() => create(false)}>Create room<PadHint button="a" focusOnly /></button>
        </>
      )}
    </main>
  );
}

function Game({ saved, onLeave }: { saved: Saved; onLeave: () => void }) {
  const first = useMemo(() => ({ t: "host" as const, code: saved.code, token: saved.token }), [saved]);
  const { state, error, send, endsAt, guessEndsAt } = useRoom(first);
  const [mute, setMute] = useState(false);
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
  if (error && !state) return <main className="screen center"><p className="error">{error}</p><button className="btn" onClick={onLeave}>Back</button></main>;
  if (!state) return <main className="screen center"><p className="muted">Connecting…</p></main>;

  return (
    <main className="screen game" data-pad-game={state.phase === "playing" || state.phase === "reveal" ? "" : undefined}>
      <button className="mute" onClick={() => setMute(!mute)} aria-label="Toggle sound">{mute ? "🔇" : "🔊"}</button>
      <button className="quit" onClick={() => { if (state.phase === "lobby" || state.phase === "finished" || window.confirm("Quit the game for everyone?")) quit(); }} aria-label="Quit game" title="Quit game">✕</button>
      <DevicePicker onPick={(deviceId) => send({ t: "device", deviceId })} />
      <HostSettings autoAdvance={state.config.autoAdvance} onAutoAdvance={(v) => send({ t: "settings", autoAdvance: v })} />
      {state.phase === "lobby" && <Lobby state={state} joinUrl={joinUrl} me={me} onPlay={(name) => saveMe({ name })} onStart={() => send({ t: "start" })} onLeave={quit} />}
      {state.phase === "playing" && <Playing state={state} endsAt={endsAt} guessEndsAt={guessEndsAt} onSkip={() => send({ t: "skip" })} onPause={() => send({ t: "pause" })} />}
      {state.phase === "reveal" && <Reveal state={state} onNext={() => send({ t: "next" })} />}
      {state.phase === "finished" && <Finished state={state} onLeave={quit} />}
      {me && <Play embedded hostToken={saved.token} saved={{ code: saved.code, name: me.name, playerId: me.playerId }} onLeave={() => saveMe(null)} onId={(playerId) => saveMe({ ...me, playerId })} />}
      {error && <p className="error toast">{error}</p>}
    </main>
  );
}

/** Top-right button: choose which Spotify device plays the music, also during a game. */
function DevicePicker({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const load = () => fetch("/api/devices").then((r) => r.json()).then(setDevices).catch(() => setDevices([]));
  return (
    <>
      <button className="devbtn" onClick={() => { const o = !open; setOpen(o); if (o) { setDevices(null); void load(); } }} aria-label="Play on device" aria-expanded={open} title="Play on device">🔈</button>
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

function Playing({ state, endsAt, guessEndsAt, onSkip, onPause }: { state: RoomState; endsAt: number; guessEndsAt: number; onSkip: () => void; onPause: () => void }) {
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
    <div className="playing">
      <div className="roundbar">
        <p className="muted">{roundLabel(state)}</p>
      <div className="controls">
        <button className={"btn ghost" + (state.skip?.host ? " voted" : "")} onClick={onSkip}>
          {state.skip?.host ? "✓ Skip vote" : "Skip song"}{state.skip ? ` (${state.skip.votes}/${state.skip.voters})` : ""}<PadHint button="select" />
        </button>
        {!guessing && <button className="btn ghost" onClick={onPause}>{state.paused ? "▶ Continue" : "⏸ Pause"}<PadHint button="start" /></button>}
      </div>
      </div>
      <div className="top">
      <div className="top-main">
      <div className={"timer" + (!unlimited && left <= 5 && !guessing ? " hot" : "") + (guessing ? " frozen" : "")}>
        <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r={R} className="track" /><circle cx="100" cy="100" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} /></svg>
        <b>{unlimited ? "∞" : Math.ceil(left)}</b>
      </div>
      {state.paused && <p className="paused-banner">⏸ PAUSED</p>}
      {guessing ? (
        <div className="guessing-banner">
          <h2>🎤 {state.guesser!.name} is guessing…</h2>
          <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />
        </div>
      ) : (
        <div className="eq" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 600}ms` }} />)}</div>
      )}
      </div>
      <div className="top-side">
      {state.config.order === "roundRobin" && state.activePlayerId && <p className="turn">🎯 {state.players.find((p) => p.id === state.activePlayerId)?.name}'s song</p>}
      <Scoreboard state={state} />
      </div>
      </div>
      <div className="top">
        <div className="top-main">
          <FoundChips found={state.found} guess={state.config.guess} hint={state.hint} />
        </div>
        {(state.config.hints === "trivia" || state.lastScore) && (
          <div className="top-side">
            <Hints state={state} />
            <ScoreBanner state={state} />
          </div>
        )}
      </div>
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
      <button className={"btn" + (state.awaitingNext ? " big" : "")} onClick={onNext}>{state.totalRounds !== undefined && state.round >= state.totalRounds ? "Final results" : "Next song"}<PadHint button="a" /></button>
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
