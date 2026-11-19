import { useEffect, useRef, useState } from "react";
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
  const t = state.trivia ?? [];
  const box = useRef<HTMLUListElement>(null);
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [t.length]); // newest fact stays in view
  if (!state.config.hints.trivia) return null;
  return (
    <ul className="trivia" aria-label="Trivia" ref={box}>
      {t.length === 0 && <li className="muted">Trivia coming up…</li>}
      {t.map((x, i) => <li key={i} title={x}>{x}</li>)}
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
    ["Hints", [c.hints.reveal && "Letters", c.hints.trivia && "Trivia", c.hints.art && "Artwork"].filter(Boolean).join(" + ") || "None"],
    ["Timer", c.roundSeconds === null ? "Unlimited" : `${c.roundSeconds} s per song`],
    ["Attempts", String(c.attempts)],
    ["Multipliers", c.multipliers ? "Yes" : "No"],
    ["Start", c.start === "beginning" ? "Beginning" : "Random"],
    ["Next song", c.autoAdvance ? "Automatic" : "Song end / manually skip"],
  ];
  return (
    <dl className="summary">
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

const STEPS = [3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96];

/** Album art as big blocks that get finer as `progress` goes from 0 to 1 (the last step is the sharp picture). */
export function PixelArt({ url, progress }: { url: string; progress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    setImg(undefined);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
  }, [url]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const size = 320;
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    if (progress >= 1) { ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, size, size); return; }
    const n = STEPS[Math.min(STEPS.length - 1, Math.floor(Math.max(0, progress) * STEPS.length))]!;
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = n;
    const t = tmp.getContext("2d")!;
    t.imageSmoothingEnabled = true;
    t.drawImage(img, 0, 0, n, n);
    ctx.imageSmoothingEnabled = false; // hard blocks
    ctx.drawImage(tmp, 0, 0, n, n, 0, 0, size, size);
  }, [img, progress]);
  return <canvas ref={canvas} className="pixelart" aria-label="Album artwork, getting clearer" />;
}
