import { useEffect, useMemo, useRef, useState } from "react";
import { FoundChips, GuessBar } from "./Found";
import { useCountdown, useRoom } from "./net";
import { Scoreboard } from "./Scoreboard";
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
export function Play({ saved, onLeave, onId, embedded, hostToken }: { saved: Saved; onLeave: () => void; onId: (id: string) => void; embedded?: boolean; hostToken?: string }) {
  const first = useMemo(() => ({ t: "join" as const, code: saved.code, name: saved.name, playerId: saved.playerId, hostToken }), [saved.code, saved.name, hostToken]);
  const [me, setMe] = useState(saved.playerId);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const { state, error, send, endsAt, guessEndsAt } = useRoom(first, (m) => {
    if (m.t === "joined") { setMe(m.playerId); onId(m.playerId); }
    if (m.t === "result") {
      if (m.title || m.artist) { sfx.correct(); navigator.vibrate?.(80); } else { sfx.wrong(); navigator.vibrate?.([40, 40, 40]); }
    }
  });
  const guessing = !!state?.guesser;
  const left = useCountdown(endsAt, guessing ? state?.remainingMs : undefined);
  const mine = state?.players.find((p) => p.id === me);
  const iAmGuesser = !!mine && state?.guesser?.id === mine.id;
  const titleRef = useRef<HTMLInputElement>(null);

  // a fresh form every time I get to answer
  useEffect(() => {
    if (iAmGuesser) { setText(""); setSent(false); sfx.buzz(); navigator.vibrate?.(30); setTimeout(() => titleRef.current?.focus(), 50); }
  }, [iAmGuesser]);

  if (embedded && (!state || !mine || state.phase !== "playing")) return null;
  if (error && !state) return <main className="screen phone center"><p className="error">{error}</p><button className="btn" onClick={onLeave}>Back</button></main>;
  if (!state || !mine) return <main className="screen phone center"><p className="muted">Joining…</p></main>;

  const Wrap = embedded ? "div" : "main";
  const exit = () => {
    if (state.phase !== "lobby" && state.phase !== "finished" && !window.confirm("Leave the game?")) return;
    send({ t: "leave" });
    onLeave();
  };
  const found = state.found;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sent || !text.trim()) return;
    setSent(true);
    send({ t: "answer", text });
  };

  return (
    <Wrap className={embedded ? "embedded" : "screen phone"}>
      {!embedded && (
        <header className="phone-head">
          <button className="exit" onClick={exit} aria-label="Exit to main screen">✕ Exit</button>
          <b>{mine.name}</b><span className="score">{mine.score}</span>
        </header>
      )}
      {state.phase === "lobby" && <div className="card center"><h2>You're in! 🎉</h2><p className="muted">Waiting for the host to start…</p><ul className="players">{state.players.map((p, i) => <li key={p.id} className={"pop c" + (i % 4)}>{p.name}</li>)}</ul></div>}

      {state.phase === "playing" && (
        <div className="card answer">
          <div className="bar-time"><i style={{ width: `${Math.min(100, (left / (state.roundMs / 1000)) * 100)}%` }} /></div>
          <FoundChips found={found} />
          {iAmGuesser ? (
            <form className="guess-form" onSubmit={submit}>
              <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />
              <label>{found?.title ? "Who is the artist?" : found?.artist ? "What's the song?" : "Song, artist, or both"}
                <input ref={titleRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCorrect="off" enterKeyHint="send" placeholder={found?.title ? "Artist" : found?.artist ? "Song title" : "e.g. Billie Jean – Michael Jackson"} />
              </label>
              <button className="btn big" disabled={sent || !text.trim()}>{sent ? "Sent…" : "Send answer"}</button>
            </form>
          ) : guessing ? (
            <p className="guessing-msg">🎤 {state.guesser!.name} is guessing…</p>
          ) : (
            <button className="answer-btn" disabled={mine.attemptsLeft === 0} onClick={() => send({ t: "buzz" })}>
              {mine.attemptsLeft === 0 ? "Out of tries" : "ANSWER"}
            </button>
          )}
          {!embedded && !iAmGuesser && (() => {
            const sk = state.skip ?? { votes: 0, voters: state.players.length };
            return <button className={"btn ghost skip" + (mine.skipVote ? " voted" : "")} onClick={() => send({ t: "skip" })}>{mine.skipVote ? "✓ Skip vote" : "Skip song"} ({sk.votes}/{sk.voters})</button>;
          })()}
        </div>
      )}

      {state.phase === "reveal" && state.reveal && (
        <div className="card center">
          {state.reveal.albumArt && <img className="art small" src={state.reveal.albumArt} alt="" />}
          <h2>{state.reveal.title}</h2>
          <p className="muted">{state.reveal.artists.join(", ")}</p>
          {(() => { const g = state.reveal.gains[mine.id]; const t = g ? g.title + g.artist : 0; return <p className={"gain-big" + (t ? "" : " none")}>{t ? `+${t}` : "No points"}</p>; })()}
          <Scoreboard state={state} reveal={state.reveal} meId={mine.id} />
          {state.awaitingNext && <p className="muted">Waiting for the host to continue…</p>}
        </div>
      )}
      {state.phase === "finished" && <div className="card center"><h2>Game over</h2><Scoreboard state={state} meId={mine.id} /><button className="btn" onClick={exit}>Back to main screen</button></div>}
    </Wrap>
  );
}
