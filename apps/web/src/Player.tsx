import { useEffect, useMemo, useRef, useState } from "react";
import { useCountdown, useRoom } from "./net";
import { sfx } from "./sfx";

interface Saved { code: string; name: string; playerId?: string }
const load = (): Saved | null => {
  try { return JSON.parse(localStorage.getItem("tg_player") ?? "null"); } catch { return null; }
};
const save = (s: Saved) => localStorage.setItem("tg_player", JSON.stringify(s));

export function Player({ onInGame }: { onInGame?: (v: boolean) => void }) {
  const [saved, setSaved] = useState<Saved | null>(load);
  useEffect(() => onInGame?.(!!saved), [!!saved]);
  return saved ? (
    <Play saved={saved} onLeave={() => { localStorage.removeItem("tg_player"); setSaved(null); }} onId={(playerId) => save({ ...saved, playerId })} />
  ) : (
    <Join onJoin={(s) => { save(s); setSaved(s); }} />
  );
}

function Join({ onJoin }: { onJoin: (s: Saved) => void }) {
  const [code, setCode] = useState((new URLSearchParams(location.search).get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const ok = code.length === 4 && name.trim().length > 0;
  return (
    <main className="screen phone">
      <h1 className="logo">Tune<span>Guesser</span></h1>
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (ok) { sfx.join(); onJoin({ code, name: name.trim() }); } }}>
        <label>Room code<input className="codein" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /></label>
        <label>Your name<input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn big" disabled={!ok}>Join</button>
      </form>
    </main>
  );
}

/** `embedded`: shown inside the host screen (only while a round is running), so the host device can play too. */
export function Play({ saved, onLeave, onId, embedded }: { saved: Saved; onLeave: () => void; onId: (id: string) => void; embedded?: boolean }) {
  const first = useMemo(() => ({ t: "join" as const, code: saved.code, name: saved.name, playerId: saved.playerId }), [saved.code, saved.name]);
  const [me, setMe] = useState(saved.playerId);
  const [res, setRes] = useState({ title: false, artist: false });
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [shake, setShake] = useState(0);
  const { state, error, send, endsAt } = useRoom(first, (m) => {
    if (m.t === "joined") { setMe(m.playerId); onId(m.playerId); }
    if (m.t === "result") {
      setRes((prev) => {
        if ((m.title && !prev.title) || (m.artist && !prev.artist)) { sfx.correct(); navigator.vibrate?.(60); }
        else if (!m.title && !m.artist) { sfx.wrong(); navigator.vibrate?.([40, 40, 40]); setShake((s) => s + 1); }
        return { title: m.title, artist: m.artist };
      });
    }
  });
  const left = useCountdown(endsAt, state?.paused ? state.remainingMs : undefined);
  const round = state?.round;
  useEffect(() => { setRes({ title: false, artist: false }); setTitle(""); setArtist(""); }, [round]);

  const mine = state?.players.find((p) => p.id === me);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state?.phase === "playing") titleRef.current?.focus(); }, [state?.phase, round]);

  if (embedded && (!state || !mine || state.phase !== "playing")) return null;
  if (error && !state) return <main className="screen phone center"><p className="error">{error}</p><button className="btn" onClick={onLeave}>Back</button></main>;
  if (!state || !mine) return <main className="screen phone center"><p className="muted">Joining…</p></main>;

  const Wrap = embedded ? "div" : "main";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send({ t: "answer", title: res.title ? undefined : title, artist: res.artist ? undefined : artist });
  };

  return (
    <Wrap className={embedded ? "embedded" : "screen phone"}>
      {!embedded && <header className="phone-head"><b>{mine.name}</b><span className="score">{mine.score}</span></header>}
      {state.phase === "lobby" && <div className="card center"><h2>You're in! 🎉</h2><p className="muted">Waiting for the host to start…</p><ul className="players">{state.players.map((p, i) => <li key={p.id} className={"pop c" + (i % 4)}>{p.name}</li>)}</ul></div>}
      {state.phase === "playing" && (
        <form key={shake} className={"card answer" + (shake ? " shake" : "")} onSubmit={submit}>
          <div className="bar-time"><i style={{ width: `${Math.min(100, (left / (state.roundMs / 1000)) * 100)}%` }} /></div>
          <label>Song title {res.title && <span className="ok">✓</span>}<input ref={titleRef} value={res.title ? "✓" : title} disabled={res.title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" autoCorrect="off" /></label>
          <label>Artist {res.artist && <span className="ok">✓</span>}<input value={res.artist ? "✓" : artist} disabled={res.artist} onChange={(e) => setArtist(e.target.value)} autoComplete="off" autoCorrect="off" /></label>
          {state.paused && <p className="paused-banner">⏸ Paused{state.pausedBy ? ` by ${state.pausedBy}` : ""}</p>}
          <button className="btn big" disabled={(res.title || !title.trim()) && (res.artist || !artist.trim())}>Send</button>
          {!embedded && (state.paused ? (
            state.pausedById === me && <button type="button" className="btn" onClick={() => send({ t: "resume" })}>▶ Resume</button>
          ) : (
            <button type="button" className="btn ghost" disabled={!!mine.pauseUsed} onClick={() => send({ t: "pause" })}>{mine.pauseUsed ? "Pause used" : "⏸ Pause (once per round)"}</button>
          ))}
        </form>
      )}
      {state.phase === "reveal" && state.reveal && (
        <div className="card center">
          {state.reveal.albumArt && <img className="art small" src={state.reveal.albumArt} alt="" />}
          <h2>{state.reveal.title}</h2>
          <p className="muted">{state.reveal.artists.join(", ")}</p>
          {(() => { const g = state.reveal.gains[mine.id]; const t = g ? g.title + g.artist : 0; return <p className={"gain-big" + (t ? "" : " none")}>{t ? `+${t}` : "No points"}</p>; })()}
        </div>
      )}
      {state.phase === "finished" && <div className="card center"><h2>Game over</h2><p className="gain-big">{mine.score}</p><button className="btn" onClick={onLeave}>Leave</button></div>}
    </Wrap>
  );
}
