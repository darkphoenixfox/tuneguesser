import type { Found, RoomState } from "@tuneguesser/shared";
import { useCountdown } from "./net";

/** What has been guessed so far this round (shown to everyone while the music continues). */
export function FoundChips({ found }: { found?: Found }) {
  return (
    <div className="found">
      <div className={"chip" + (found?.title ? " got" : "")}>
        <small>Song</small>
        <b>{found?.title ? found.title.text : "? ? ? ? ?"}</b>
        {found?.title && <em>{found.title.by}</em>}
      </div>
      <div className={"chip" + (found?.artist ? " got" : "")}>
        <small>Artist</small>
        <b>{found?.artist ? found.artist.text : "? ? ? ? ?"}</b>
        {found?.artist && <em>{found.artist.by}</em>}
      </div>
    </div>
  );
}

/** Shrinking bar: how long the guesser has left to send their answer. */
export function GuessBar({ endsAt, totalMs }: { endsAt: number; totalMs: number }) {
  const left = useCountdown(endsAt);
  return <div className="bar-time"><i style={{ width: `${Math.min(100, (left * 1000 / totalMs) * 100)}%` }} /></div>;
}

/** Hint area: underscores that fill in over time, or trivia facts. */
export function Hints({ state }: { state: RoomState }) {
  if (state.hint) {
    return (
      <div className="hint" aria-label="Hint">
        <div><small>Song</small><code>{state.hint.title}</code></div>
        <div><small>Artist</small><code>{state.hint.artist}</code></div>
      </div>
    );
  }
  if (state.config.hints === "trivia") {
    const t = state.trivia ?? [];
    return (
      <ul className="trivia" aria-label="Trivia">
        {t.length === 0 && <li className="muted">Trivia coming up…</li>}
        {t.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    );
  }
  return null;
}

/** "+1350 Ana · ×1.5 Title + artist at once · ×1.25 1 round in a row" */
export function ScoreBanner({ state }: { state: RoomState }) {
  const l = state.lastScore;
  if (!l || l.points <= 0) return null;
  return (
    <div className="score-banner pop" key={`${l.name}${l.points}`}>
      <b>+{l.points}</b> <span>{l.name}</span>
      {l.multipliers.map((m) => <em key={m.label}>×{m.x} {m.label}</em>)}
    </div>
  );
}
