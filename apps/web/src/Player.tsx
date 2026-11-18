import { useEffect, useMemo, useRef, useState } from "react";
import { FoundChips, GameSummary, GuessBar, Hints, ScoreBanner } from "./Found";
import { ThemeButton } from "./Settings";
import { Key, PadHint } from "./input/Glyph";
import { PadKeyboard } from "./input/PadKeyboard";
import { onPadButton, usePad } from "./input/pad";
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
      <ThemeButton />
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
  const left = useCountdown(endsAt, guessing || state?.paused ? state?.remainingMs : undefined);
  const pad = usePad();
  const mine = state?.players.find((p) => p.id === me);
  const iAmGuesser = !!mine && state?.guesser?.id === mine.id;
  const titleRef = useRef<HTMLInputElement>(null);

  // a fresh form every time I get to answer
  useEffect(() => {
    if (iAmGuesser) { setText(""); setSent(false); sfx.buzz(); navigator.vibrate?.(30); setTimeout(() => titleRef.current?.focus(), 50); }
  }, [iAmGuesser]);

  // keyboard and gamepad shortcuts (the host screen handles pause/skip/next itself when this is embedded in it)
  const live = useRef({ state, mine, iAmGuesser, sent, text });
  live.current = { state, mine, iAmGuesser, sent, text };
  const doSubmit = () => {
    const l = live.current;
    if (l.sent || !l.text.trim()) return;
    setSent(true);
    send({ t: "answer", text: l.text });
  };
  const doChoose = (i: number) => {
    const l = live.current;
    const o = l.state?.options?.[i];
    if (!l.iAmGuesser || !o || l.sent) return;
    setSent(true);
    send({ t: "choose", optionId: o.id });
  };
  /** the accept key/button: ANSWER when a song is playing, next song at the reveal */
  const accept = () => {
    const { state: st, mine: m, iAmGuesser: g } = live.current;
    if (!st || !m || g) return;
    if (st.phase === "playing" && !st.guesser && !st.paused && m.attemptsLeft > 0 && (st.config.order !== "roundRobin" || st.activePlayerId === m.id)) send({ t: "buzz" });
    else if (st.phase === "reveal" && !embedded) send({ t: "next" });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if (e.altKey && !embedded) {
        if (e.code === "KeyS") { e.preventDefault(); send({ t: "skip" }); }
        else if (e.code === "KeyP") { e.preventDefault(); send({ t: "pause" }); }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey) return;
      if (e.key === "Enter" && t?.tagName !== "BUTTON") accept();
      else if (/^[1-4]$/.test(e.key)) doChoose(+e.key - 1);
    };
    window.addEventListener("keydown", onKey);
    const off = onPadButton((b) => {
      const l = live.current;
      const choice = ({ a: 0, b: 1, x: 2, y: 3 } as Record<string, number>)[b];
      if (l.iAmGuesser && l.state?.options) { if (choice !== undefined) doChoose(choice); return; }
      if (l.iAmGuesser) return; // the on-screen keyboard has the buttons
      if (b === "a") accept();
      else if (!embedded && b === "start") send({ t: "pause" });
      else if (!embedded && b === "select") send({ t: "skip" });
    });
    return () => { window.removeEventListener("keydown", onKey); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, send]);

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
          <b>{mine.name}</b><ThemeButton /><span className="score">{mine.score}</span>
        </header>
      )}
      {state.phase === "lobby" && <div className="card center"><h2>You're in! 🎉</h2><p className="muted">Waiting for the host to start…</p><ul className="players">{state.players.map((p, i) => <li key={p.id} className={"pop c" + (i % 4)}>{p.name}</li>)}</ul><GameSummary state={state} /></div>}

      {state.phase === "playing" && (
        <div className="card answer">
          <div className="bar-time"><i style={{ width: state.roundMs === null ? "100%" : `${Math.min(100, (left / (state.roundMs / 1000)) * 100)}%` }} /></div>
          {state.paused && <p className="paused-banner">⏸ PAUSED</p>}
          <Hints state={state} />
          <FoundChips found={found} guess={state.config.guess} />
          <ScoreBanner state={state} />
          {iAmGuesser && state.options ? (
            <div className="guess-form">
              <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />
              <div className="choices">
                {state.options.map((o, i) => <button key={o.id} className="choice" disabled={sent} onClick={() => doChoose(i)}><span className="num">{i + 1}</span>{o.label}{(["a", "b", "x", "y"] as const)[i] && <PadHint button={(["a", "b", "x", "y"] as const)[i]!} />}</button>)}
              </div>
            </div>
          ) : iAmGuesser ? (
            <form className="guess-form" onSubmit={submit}>
              <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />
              <label>{state.config.guess === "title" ? "What's the song?" : state.config.guess === "artist" ? "Who is the artist?" : found?.title ? "Who is the artist?" : found?.artist ? "What's the song?" : "Song, artist, or both"}
                <input ref={titleRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCorrect="off" enterKeyHint="send" placeholder={state.config.guess === "title" ? "Song title" : state.config.guess === "artist" ? "Artist" : found?.title ? "Artist" : found?.artist ? "Song title" : "e.g. Billie Jean – Michael Jackson"} />
              </label>
              <button className="btn big" disabled={sent || !text.trim()}>{sent ? "Sent…" : "Send answer"}</button>
              {pad.connected && <PadKeyboard disabled={sent} onType={(c) => setText((t) => (t + c).slice(0, 160))} onBack={() => setText((t) => t.slice(0, -1))} onSend={doSubmit} />}
            </form>
          ) : guessing ? (
            <p className="guessing-msg">🎤 {state.guesser!.name} is guessing…</p>
          ) : state.config.order === "roundRobin" && state.activePlayerId !== mine.id ? (
            <p className="guessing-msg">🎯 {state.players.find((p) => p.id === state.activePlayerId)?.name ?? "Someone"}'s song</p>
          ) : (
            <button className="answer-btn" disabled={mine.attemptsLeft === 0} onClick={() => send({ t: "buzz" })}>
              {mine.attemptsLeft === 0 ? "Out of tries" : state.config.order === "roundRobin" ? "YOUR SONG: ANSWER" : "ANSWER"}
              {mine.attemptsLeft > 0 && <><Key>Enter</Key><PadHint button="a" /></>}
            </button>
          )}
          {!embedded && !iAmGuesser && (state.config.order !== "roundRobin" || state.activePlayerId === mine.id) && (() => {
            const sk = state.skip ?? { votes: 0, voters: state.players.length };
            return <button className={"btn ghost skip" + (mine.skipVote ? " voted" : "")} onClick={() => send({ t: "skip" })}>{mine.skipVote ? "✓ Skip vote" : "Skip song"} ({sk.votes}/{sk.voters}) <Key>Alt+S</Key><PadHint button="select" /></button>;
          })()}
          {!embedded && !iAmGuesser && <button className="btn ghost" onClick={() => send({ t: "pause" })}>{state.paused ? "▶ Continue" : "⏸ Pause"} <Key>Alt+P</Key><PadHint button="start" /></button>}
        </div>
      )}

      {state.phase === "reveal" && state.reveal && (
        <div className="card center">
          {state.reveal.albumArt && <img className="art small" src={state.reveal.albumArt} alt="" />}
          <h2>{state.reveal.title}</h2>
          <p className="muted">{state.reveal.artists.join(", ")}</p>
          {(() => { const g = state.reveal.gains[mine.id]; const t = g ? g.title + g.artist : 0; return <p className={"gain-big" + (t ? "" : " none")}>{t ? `+${t}` : "No points"}</p>; })()}
          <ScoreBanner state={state} />
          <Scoreboard state={state} reveal={state.reveal} meId={mine.id} />
          {state.awaitingNext && <p className="muted">The song plays on. Next round starts at its end, or press <Key>Enter</Key><PadHint button="a" /> to continue.</p>}
          <button className="btn" onClick={() => send({ t: "next" })}>Next song <Key>Enter</Key><PadHint button="a" /></button>
        </div>
      )}
      {state.phase === "finished" && <div className="card center"><h2>Game over</h2><Scoreboard state={state} meId={mine.id} /><button className="btn" onClick={exit}>Back to main screen</button></div>}
    </Wrap>
  );
}
