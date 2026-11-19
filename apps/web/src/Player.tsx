import { useEffect, useMemo, useRef, useState } from "react";
import { FoundChips, GameSummary, GuessBar, Hints, PixelArt, ScoreBanner } from "./Found";
import { SettingsMenu, ThemeButton } from "./Settings";
import { PadHint } from "./input/Glyph";
import { MicButton, MicToggle } from "./input/Mic";
import { PadKeyboard } from "./input/PadKeyboard";
import { Logo } from "./Logo";
import { ErrorPage } from "./ErrorPage";
import { Confirm } from "./input/Confirm";
import { onPadButton, usePad } from "./input/pad";
import { useCountdown, useRoom, useScrollTop } from "./net";
import { Scoreboard } from "./Scoreboard";
import { sfx } from "./sfx";
import type { PlayerCommand } from "@tuneguesser/shared";
import { useYouTubePlayer } from "./YouTubePlayer";
import { t } from "./i18n";

interface Saved { code: string; name: string; playerId?: string }
const load = (): Saved | null => {
  try {
    const s: Saved | null = JSON.parse(localStorage.getItem("tg_player") ?? "null");
    // opened with a room code (QR code / link) for another room than the saved one: forget the old session
    const url = (new URLSearchParams(location.search).get("code") ?? "").toUpperCase();
    if (s && url && url !== s.code) { localStorage.removeItem("tg_player"); return null; }
    return s;
  } catch { return null; }
};
const save = (s: Saved) => { try { localStorage.setItem("tg_player", JSON.stringify(s)); if (s.name) localStorage.setItem("tg_name", s.name); } catch { /* private mode */ } };
const savedName = () => { try { return localStorage.getItem("tg_name") ?? ""; } catch { return ""; } };

export function Player({ onBack }: { onBack?: () => void }) {
  const [saved, setSaved] = useState<Saved | null>(load);
  return saved ? (
    <Play saved={saved} onLeave={() => { localStorage.removeItem("tg_player"); setSaved(null); }} onId={(playerId) => save({ ...saved, playerId })} />
  ) : (
    <Join onBack={onBack} onJoin={(s) => { save(s); setSaved(s); }} />
  );
}

function Join({ onJoin, onBack }: { onJoin: (s: Saved) => void; onBack?: () => void }) {
  const [code, setCode] = useState((new URLSearchParams(location.search).get("code") ?? "").toUpperCase());
  const [name, setName] = useState(savedName);
  const ok = code.length === 4 && name.trim().length > 0;
  return (
    <main className="screen phone">
      {onBack && <button className="backlink" onClick={onBack}>{t("← Menu")}</button>}
      <SettingsMenu apk solo />
      <Logo />
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (ok) { sfx.join(); onJoin({ code, name: name.trim() }); } }}>
        <label>{t("Room code")}<input className="codein" value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} /></label>
        <label>{t("Your name")}<input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn big" disabled={!ok}>{t("Join")}<PadHint button="a" focusOnly /></button>
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
  const [words, setWords] = useState<string[]>([]);
  const [askLeave, setAskLeave] = useState(false);
  // YouTube mode: optionally play the music on this device too (a tap is needed, browsers block sound otherwise)
  const [listening, setListening] = useState(false);
  const ytRun = useRef<(c: PlayerCommand) => void>();
  const { state, error, connected, send, endsAt, guessEndsAt } = useRoom(first, (m) => {
    if (m.t === "player") ytRun.current?.(m.cmd);
    if (m.t === "words") setWords(m.list);
    if (m.t === "joined") { setMe(m.playerId); onId(m.playerId); }
    if (m.t === "result") {
      if (m.title || m.artist) { sfx.correct(); navigator.vibrate?.(80); } else { sfx.wrong(); navigator.vibrate?.([40, 40, 40]); }
    }
  });
  const yt = useYouTubePlayer(listening && !embedded && !!state?.youtube, () => {});
  ytRun.current = yt.run;
  useEffect(() => { if (connected && listening) send({ t: "listen", on: true }); }, [connected]); // the server forgets this after a reconnect
  const toggleListen = () => { const on = !listening; setListening(on); send({ t: "listen", on }); };
  const guessing = !!state?.guesser;
  const left = useCountdown(endsAt, guessing || state?.paused ? state?.remainingMs : undefined);
  const pad = usePad();
  const mine = state?.players.find((p) => p.id === me);
  useScrollTop(embedded ? "" : (state?.phase ?? "") + (mine ? "m" : ""));
  const iAmGuesser = !!mine && state?.guesser?.id === mine.id;
  const titleRef = useRef<HTMLInputElement>(null);

  // a fresh form every time I get to answer
  useEffect(() => {
    if (iAmGuesser) { setText(""); setSent(false); sfx.buzz(); navigator.vibrate?.(30); setTimeout(() => titleRef.current?.focus(), 50); }
  }, [iAmGuesser]);

  // keyboard and gamepad shortcuts (the host screen handles pause/skip/next itself when this is embedded in it)
  const live = useRef({ state, mine, iAmGuesser, sent, text });
  live.current = { state, mine, iAmGuesser, sent, text };
  const autoSend = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(autoSend.current), []);
  useEffect(() => { if (!iAmGuesser) clearTimeout(autoSend.current); }, [iAmGuesser]);
  /** spoken answer: shown in the box, sent 1.5 s after the speech ends unless the player edits or cancels it */
  const heard = (t: string) => { setText(t); clearTimeout(autoSend.current); autoSend.current = setTimeout(() => doSubmit(), 1500); };
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
      if (e.key === "Escape" && live.current.iAmGuesser) { e.preventDefault(); send({ t: "cancel" }); return; }
      if (typing || e.ctrlKey || e.metaKey) return;
      if (e.key === "Enter" && t?.tagName !== "BUTTON") accept();
      else if (/^[1-4]$/.test(e.key)) doChoose(+e.key - 1);
    };
    window.addEventListener("keydown", onKey);
    const off = onPadButton((b) => {
      const l = live.current;
      const choice = ({ a: 0, b: 1, x: 2, y: 3 } as Record<string, number>)[b];
      if (l.iAmGuesser && b === "start") return void send({ t: "cancel" }); // give up this turn
      if (l.iAmGuesser && l.state?.options) { if (choice !== undefined) doChoose(choice); return; }
      if (l.iAmGuesser) return; // the on-screen keyboard has the buttons
      if (b === "a") accept();
      else if (!embedded && b === "start") send({ t: "pause" });
      else if (!embedded && b === "select") send({ t: "skip" });
    });
    return () => { window.removeEventListener("keydown", onKey); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, send]);

  // tell the server when this device types with the on-screen keyboard (it gets more time to answer)
  useEffect(() => { if (mine) send({ t: "padkb", on: pad.connected }); }, [pad.connected, !!mine]);

  if (embedded && (!state || !mine || state.phase !== "playing")) return null;
  if (error && !state) return <ErrorPage error={error} onBack={onLeave} />;
  if (!state || !mine) return <main className="screen phone center"><p className="muted">{t("Joining…")}</p></main>;

  const Wrap = embedded ? "div" : "main";
  const leaveNow = () => { send({ t: "leave" }); onLeave(); };
  const exit = () => {
    if (state.phase !== "lobby" && state.phase !== "finished") setAskLeave(true); else leaveNow();
  };
  const found = state.found;
  const canSkip = !embedded && state.phase === "playing" && !iAmGuesser && (state.config.order !== "roundRobin" || state.activePlayerId === mine.id);
  const canPause = !embedded && state.phase === "playing" && !iAmGuesser;
  const sk = state.skip ?? { votes: 0, voters: state.players.length };
  const skipText = state.players.length > 1 && sk.votes > 0 ? `${sk.votes}/${sk.voters}` : "";
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sent || !text.trim()) return;
    setSent(true);
    send({ t: "answer", text });
  };

  return (
    <Wrap className={embedded ? "embedded" : "screen phone"} data-pad-game={state.phase === "playing" || state.phase === "reveal" ? "" : undefined}>
      {!embedded && (
        <header className="statusbar phone-head">
          <button className="exit" onClick={exit} aria-label={t("Exit to main screen")}>✕</button>
          <b>{mine.name}{(state.phase === "playing" || state.phase === "reveal") && <small className="phone-round">{state.config.playTo.kind === "score" ? t("Round {n}", { n: state.round }) : t("Round {n}/{total}", { n: state.round, total: state.totalRounds ?? state.config.playTo.rounds })}</small>}</b><ThemeButton /><MicToggle className="skip-top mic-top" />{state.youtube && <button className={"skip-top" + (listening ? " on" : "")} onClick={toggleListen} aria-pressed={listening} aria-label={t("Play the music on this device too")} title={listening ? t("Music plays on this device too") : t("Also play the music on this device")}><span style={{ opacity: listening ? 1 : .45 }}>🎧</span></button>}{canPause && <button className={"skip-top" + (state.paused ? " voted" : "")} onClick={() => send({ t: "pause" })} aria-label={state.paused ? t("Continue") : t("Pause")} title={state.paused ? t("Continue") : t("Pause")}>{state.paused ? "▶" : "⏸"}</button>}{canSkip && <button className={"skip-top" + (mine.skipVote ? " voted" : "")} onClick={() => send({ t: "skip" })} aria-label={t("Skip song")} title={t("Skip song")}>⏭{skipText && <small>{skipText}</small>}</button>}<span className="score">{mine.score}</span>
        </header>
      )}
      {yt.element}
      {state.phase === "lobby" && <div className="card center"><h2>{t("You're in! 🎉")}</h2><p className="muted">{t("Waiting for the host to start…")}</p><ul className="players">{state.players.map((p, i) => <li key={p.id} className={"pop c" + (i % 4)}>{p.name}</li>)}</ul><GameSummary state={state} /></div>}

      {state.phase === "playing" && (
        <div className="card answer">
          {!embedded && <div className="bar-time hbar"><i style={{ width: `${state.roundMs === null ? 100 : Math.min(100, (left / (state.roundMs / 1000)) * 100)}%` }} /></div>}
          <div className="pl-row">
          {!embedded && <div className="vbar" aria-hidden="true"><i style={{ height: `${state.roundMs === null ? 100 : Math.min(100, (left / (state.roundMs / 1000)) * 100)}%` }} /></div>}
          <div className="pl-main">
          {!embedded && (<>
          {state.paused && <p className="paused-banner">{t("⏸ PAUSED")}</p>}
          {state.art && <div className="phone-art"><PixelArt url={state.art.url} progress={state.art.progress} /></div>}
          <Hints state={state} />
          <FoundChips found={found} guess={state.config.guess} hint={state.hint} />
          <ScoreBanner state={state} />
          </>)}
          {iAmGuesser && state.options ? (
            <div className="guess-form">
              <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />
              <button type="button" className="btn ghost" onClick={() => send({ t: "cancel" })}>{t("Cancel")}<PadHint button="start" /></button>
              <div className="choices">
                {state.options.map((o, i) => <button key={o.id} className="choice" disabled={sent} onClick={() => doChoose(i)}><span className="num">{i + 1}</span>{o.label}{(["a", "b", "x", "y"] as const)[i] && <PadHint button={(["a", "b", "x", "y"] as const)[i]!} />}</button>)}
              </div>
            </div>
          ) : iAmGuesser ? (
            <form className={"guess-form" + (pad.connected ? " with-kb" : "")} onSubmit={submit}>
              {!embedded && <GuessBar endsAt={guessEndsAt} totalMs={state.guessMs} />}
              {pad.connected ? (
                <PadKeyboard disabled={sent} text={text} words={words} onText={setText} onSend={doSubmit} onCancel={() => send({ t: "cancel" })}>
                  <label>{state.config.guess === "title" ? t("What's the song?") : state.config.guess === "artist" ? t("Who is the artist?") : found?.title ? t("Who is the artist?") : found?.artist ? t("What's the song?") : t("Song, artist, or both")}
                <input ref={titleRef} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCorrect="off" enterKeyHint="send" placeholder={state.config.guess === "title" ? t("Song title") : state.config.guess === "artist" ? t("Artist") : found?.title ? t("Artist") : found?.artist ? t("Song title") : t("e.g. Billie Jean – Michael Jackson")} />
              </label>
                </PadKeyboard>
              ) : (
                <div className="gf-main">
                  <div className="answer-row">
                  <label>{state.config.guess === "title" ? t("What's the song?") : state.config.guess === "artist" ? t("Who is the artist?") : found?.title ? t("Who is the artist?") : found?.artist ? t("What's the song?") : t("Song, artist, or both")}
                <input ref={titleRef} value={text} onChange={(e) => { clearTimeout(autoSend.current); setText(e.target.value); }} autoComplete="off" autoCorrect="off" enterKeyHint="send" placeholder={state.config.guess === "title" ? t("Song title") : state.config.guess === "artist" ? t("Artist") : found?.title ? t("Artist") : found?.artist ? t("Song title") : t("e.g. Billie Jean – Michael Jackson")} />
              </label>
                  <MicButton disabled={sent} onText={(t) => { clearTimeout(autoSend.current); setText(t); }} onFinal={heard} />
                  </div>
                  <button className="btn big" disabled={sent || !text.trim()}>{sent ? t("Sent…") : t("Send answer")}</button>
                  <button type="button" className="btn ghost" onClick={() => { clearTimeout(autoSend.current); send({ t: "cancel" }); }}>{t("Cancel")}</button>
                </div>
              )}
            </form>
          ) : guessing ? (
            <p className="guessing-msg">🎤 {t("{name} is guessing…", { name: state.guesser!.name })}</p>
          ) : state.config.order === "roundRobin" && state.activePlayerId !== mine.id ? (
            <p className="guessing-msg">🎯 {t("{name}'s song", { name: state.players.find((p) => p.id === state.activePlayerId)?.name ?? t("Someone") })}</p>
          ) : (
            <button className="answer-btn" data-pad-first disabled={mine.attemptsLeft === 0} onClick={() => send({ t: "buzz" })}>
              {mine.attemptsLeft === 0 ? t("Out of tries") : state.config.order === "roundRobin" ? t("YOUR SONG: ANSWER") : t("ANSWER")}
              {mine.attemptsLeft > 0 && <PadHint button="a" />}
            </button>
          )}
          </div>
          </div>
        </div>
      )}

      {state.phase === "reveal" && state.reveal && (
        <div className="card center">
          <div className="cols">
            <div className="col">
              {state.reveal.albumArt && <img className="art small" src={state.reveal.albumArt} alt="" />}
              <h2>{state.reveal.title}</h2>
              <p className="muted">{state.reveal.artists.join(", ")}</p>
              {(() => { const g = state.reveal.gains[mine.id]; const t = g ? g.title + g.artist : 0; return <p className={"gain-big" + (t ? "" : " none")}>{t ? `+${t}` : "No points"}</p>; })()}
            </div>
            <div className="col">
              <ScoreBanner state={state} bare />
              <Scoreboard state={state} reveal={state.reveal} meId={mine.id} />
            </div>
          </div>
          {state.awaitingNext && <p className="muted">{t("The song plays on. Next round starts at its end, or when someone presses Next song.")}</p>}
          <button className="btn" onClick={() => send({ t: "next" })}>{t("Next song")}<PadHint button="a" /></button>
        </div>
      )}
      {state.phase === "finished" && <div className="card center"><h2>{t("Game over")}</h2><Scoreboard state={state} meId={mine.id} /><button className="btn" onClick={exit}>{t("Back to main screen")}</button></div>}
      {askLeave && <Confirm message={t("Leave the game?")} confirmLabel={t("Leave")} onCancel={() => setAskLeave(false)} onConfirm={leaveNow} />}
    </Wrap>
  );
}
