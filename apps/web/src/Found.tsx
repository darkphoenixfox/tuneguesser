import type { Found, RoomState } from "@tuneguesser/shared";
import { useCountdown } from "./net";

/**
 * The answer panel: what has been found, else the letter hint (when Reveal hints are on), else "? ? ?".
 * Parts that are not being guessed only appear (in full) when there is a hint to show as context.
 */
export function FoundChips({ found, guess = "both", hint }: { found?: Found; guess?: "both" | "title" | "artist"; hint?: { title: string; artist: string } }) {
  const part = (key: "title" | "artist", label: string) => {
    const wanted = guess === "both" || guess === key;
    const got = found?.[key];
    if (!wanted && !hint) return null;
    return (
      <div className={"chip" + (got ? " got" : "") + (!wanted ? " ctx" : "") + (hint && !got && wanted ? " hinted" : "")}>
        <small>{label}</small>
        <b>{got ? got.text : hint ? hint[key] : "? ? ? ? ?"}</b>
        {got && <em>{got.by}</em>}
      </div>
    );
  };
  return <div className="found">{part("title", "Song")}{part("artist", "Artist")}</div>;
}

/** Shrinking bar: how long the guesser has left to send their answer. */
export function GuessBar({ endsAt, totalMs }: { endsAt: number; totalMs: number }) {
  const left = useCountdown(endsAt);
  return <div className="bar-time"><i style={{ width: `${Math.min(100, (left * 1000 / totalMs) * 100)}%` }} /></div>;
}

/** Trivia facts (the letter hints are shown inside the answer panel). */
export function Hints({ state }: { state: RoomState }) {
  if (state.config.hints !== "trivia") return null;
  const t = state.trivia ?? [];
  return (
    <ul className="trivia" aria-label="Trivia">
      {t.length === 0 && <li className="muted">Trivia coming up…</li>}
      {t.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}

/** "+1350 Ana · ×1.5 Title + artist at once · ×1.25 1 round in a row" */
export function ScoreBanner({ state, bare }: { state: RoomState; bare?: boolean }) {
  const l = state.lastScore;
  if (!l || l.points <= 0) return null;
  if (bare && l.multipliers.length === 0) return null; // the scoreboard already shows the points
  return (
    <div className="score-banner pop" key={`${l.name}${l.points}`}>
      {!bare && <b>+{l.points}</b>} <span>{l.name}</span>
      {l.multipliers.map((m) => <em key={m.label}>×{m.x} {m.label}</em>)}
    </div>
  );
}

/** The game settings, as a list of chips (shown in the lobby). */
export function GameSummary({ state }: { state: RoomState }) {
  const c = state.config;
  const items: Array<[string, string]> = [
    ["Play to", c.playTo.kind === "rounds" ? `${c.playTo.rounds} rounds` : `${c.playTo.target} points`],
    ["Order", c.order === "buzzer" ? "Buzzer" : "Round robin"],
    ["Guess", c.guess === "both" ? "Song + artist" : c.guess === "title" ? "Song" : "Artist"],
    ["Answers", c.answers === "type" ? "Type" : "Multiple choice"],
    ["Hints", c.hints === "none" ? "None" : c.hints === "reveal" ? "Reveal letters" : "Trivia"],
    ["Timer", c.roundSeconds === null ? "Unlimited" : `${c.roundSeconds} s per song`],
    ["Attempts", String(c.attempts)],
    ["Multipliers", c.multipliers ? "Yes" : "No"],
    ["Next song", c.autoAdvance ? "Automatic" : "Host / song end"],
  ];
  return (
    <dl className="summary">
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
