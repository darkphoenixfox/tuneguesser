import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { RevealInfo, RoomState } from "@tuneguesser/shared";
import { FoundChips, GuessBar } from "./Found";
import { useCountdown, useRoom } from "./net";
import { Play } from "./Player";
import { setMuted, sfx } from "./sfx";

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

function Setup({ onCreated }: { onCreated: (s: Saved) => void }) {
  const [me, setMe] = useState<{ spotify: boolean; spotifyConfigured: boolean }>();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [rounds, setRounds] = useState(10);
  const [seconds, setSeconds] = useState(40);
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
    fetch("/api/playlists").then((r) => r.json()).then((p: Playlist[]) => setPlaylists(p)).catch(() => setErr("Could not load playlists"));
    void loadDevices();
  }, [me?.spotify]);

  const create = async (demo: boolean) => {
    setBusy(true); setErr("");
    sfx.start(); // unlocks audio on this screen
    const r = await fetch("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ demo, playlistId, deviceId: deviceId || undefined, rounds, roundSeconds: seconds }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Could not create room");
    onCreated({ code: j.code, token: j.hostToken });
  };

  return (
    <main className="screen setup">
      <h1 className="logo">Tune<span>Guesser</span></h1>
      {err && <p className="error">{err}</p>}
      {!me ? <p className="muted">Loading…</p> : !me.spotify ? (
        <div className="card center">
          <p>Log in with the Spotify account that will play the music (Premium required).</p>
          {me.spotifyConfigured ? <a className="btn big" href="/api/auth/login">Log in with Spotify</a> : <p className="error">Server has no SPOTIFY_CLIENT_ID.</p>}
          <button className="btn ghost" disabled={busy} onClick={() => create(true)}>Try demo mode (no music)</button>
        </div>
      ) : (
        <>
          <section className="card">
            <h2>1. Pick a playlist</h2>
            <p className="muted">Only playlists you own or collaborate on can be used (a Spotify rule). To use someone else's or an editorial playlist, copy its songs into one of your own.</p>
            <div className="grid">
              {playlists.map((p) => (
                <button key={p.id} className={"pl" + (p.id === playlistId ? " sel" : "")} onClick={() => setPlaylistId(p.id)}>
                  {p.image ? <img src={p.image} alt="" /> : <div className="ph" />}
                  <b>{p.name}</b><small>{p.tracks} tracks</small>
                </button>
              ))}
            </div>
          </section>
          <section className="card row">
            <label>Play on
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} onFocus={loadDevices}>
                {devices.length === 0 && <option value="">No device found – open Spotify somewhere</option>}
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type}){d.active ? " ●" : ""}</option>)}
              </select>
            </label>
            <label>Rounds <input type="number" min={1} max={50} value={rounds} onChange={(e) => setRounds(+e.target.value)} /></label>
            <label>Seconds per song <input type="number" min={10} max={120} value={seconds} onChange={(e) => setSeconds(+e.target.value)} /></label>
          </section>
          <button className="btn big" disabled={!playlistId || !deviceId || busy} onClick={() => create(false)}>Create room</button>
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

  if (error && !state) return <main className="screen center"><p className="error">{error}</p><button className="btn" onClick={onLeave}>Back</button></main>;
  if (!state) return <main className="screen center"><p className="muted">Connecting…</p></main>;

  return (
    <main className="screen game">
      <button className="mute" onClick={() => setMute(!mute)} aria-label="Toggle sound">{mute ? "🔇" : "🔊"}</button>
      {state.phase === "lobby" && <Lobby state={state} joinUrl={joinUrl} me={me} onPlay={(name) => saveMe({ name })} onStart={() => send({ t: "start" })} onLeave={onLeave} />}
      {state.phase === "playing" && <Playing state={state} endsAt={endsAt} guessEndsAt={guessEndsAt} onSkip={() => send({ t: "skip" })} />}
      {state.phase === "reveal" && <Reveal state={state} onNext={() => send({ t: "next" })} />}
      {state.phase === "finished" && <Finished state={state} onLeave={onLeave} />}
      {me && <Play embedded saved={{ code: saved.code, name: me.name, playerId: me.playerId }} onLeave={() => saveMe(null)} onId={(playerId) => saveMe({ ...me, playerId })} />}
      {error && <p className="error toast">{error}</p>}
    </main>
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
        {me ? <p className="muted">You're playing as <b>{me.name}</b> on this screen.</p> : (
          <form className="hostplay" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { sfx.join(); onPlay(name.trim()); } }}>
            <input placeholder="Play on this screen too? Your name" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim() || state.players.length >= 4}>Join</button>
          </form>
        )}
        <button className="btn big" disabled={state.players.length === 0} onClick={onStart}>Start game</button>
        <button className="btn ghost" onClick={onLeave}>Cancel</button>
      </div>
    </div>
  );
}

function Scoreboard({ state, reveal }: { state: RoomState; reveal?: RevealInfo }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <ol className="board">
      {sorted.map((p) => {
        const g = reveal?.gains[p.id];
        const add = g ? g.title + g.artist : 0;
        return (
          <li key={p.id} className={(p.attemptsLeft === 0 && state.phase === "playing" ? "tried " : "") + (state.guesser?.id === p.id ? "guessing" : "")}>
            <span className="name">{p.name}</span>
            <span className="score">{p.score}</span>
            {add > 0 && <span className="gain">+{add}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Playing({ state, endsAt, guessEndsAt, onSkip }: { state: RoomState; endsAt: number; guessEndsAt: number; onSkip: () => void }) {
  const guessing = !!state.guesser;
  const left = useCountdown(endsAt, guessing ? state.remainingMs : undefined);
  const frac = Math.min(1, left / (state.roundMs / 1000));
  const lastTick = useRef(-1);
  useEffect(() => {
    const s = Math.ceil(left);
    if (!guessing && s <= 5 && s > 0 && s !== lastTick.current) { lastTick.current = s; sfx.tick(); }
  }, [left, guessing]);
  const gid = state.guesser?.id;
  useEffect(() => { if (gid) sfx.buzz(); }, [gid]);
  const foundCount = (state.found?.title ? 1 : 0) + (state.found?.artist ? 1 : 0);
  const prevFound = useRef(0);
  useEffect(() => { if (foundCount > prevFound.current) sfx.correct(); prevFound.current = foundCount; }, [foundCount]);
  const R = 90, C = 2 * Math.PI * R;
  return (
    <div className="playing">
      <p className="muted">Round {state.round} / {state.totalRounds}</p>
      <div className={"timer" + (left <= 5 && !guessing ? " hot" : "") + (guessing ? " frozen" : "")}>
        <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r={R} className="track" /><circle cx="100" cy="100" r={R} className="bar" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} /></svg>
        <b>{Math.ceil(left)}</b>
      </div>
      {guessing ? (
        <div className="guessing-banner">
          <h2>🎤 {state.guesser!.name} is guessing…</h2>
          <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />
        </div>
      ) : (
        <div className="eq" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 600}ms` }} />)}</div>
      )}
      <FoundChips found={state.found} />
      <Scoreboard state={state} />
      <div className="controls"><button className="btn ghost" onClick={onSkip}>Skip song</button></div>
    </div>
  );
}

function Reveal({ state, onNext }: { state: RoomState; onNext: () => void }) {
  const r = state.reveal!;
  return (
    <div className="reveal">
      {r.albumArt && <img className="art spin-in" src={r.albumArt} alt="" />}
      <h1 className="rv-title">{r.title}</h1>
      <h2 className="rv-artist">{r.artists.join(", ")}{r.year ? ` · ${r.year}` : ""}</h2>
      <Scoreboard state={state} reveal={r} />
      <button className="btn" onClick={onNext}>{state.round >= state.totalRounds ? "Final results" : "Next song"}</button>
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
