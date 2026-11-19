import { useEffect, useMemo, useState } from "react";
import type { RoomState } from "@tuneguesser/shared";
import { t } from "./i18n";

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The game clock of a "play to a score" game, ticking between server updates. null when the game has none. */
export function useGameClock(state: RoomState): number | null {
  const at = useMemo(() => Date.now(), [state]); // when this state arrived
  const [now, setNow] = useState(Date.now());
  const running = !!state.clock?.running;
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [running]);
  if (!state.clock) return null;
  return state.clock.ms + (running ? Math.max(0, Math.max(now, at) - at) : 0);
}

export function GameTimer({ state }: { state: RoomState }) {
  const ms = useGameClock(state);
  if (ms === null) return null;
  return <b className="game-timer" title={t("Time so far")}>⏱ {fmtTime(ms)}</b>;
}

/** Best results of games played with exactly the same settings. */
export function HighScoreTable({ state }: { state: RoomState }) {
  const hs = state.highScores;
  const final = useGameClock(state);
  if (!hs || !hs.entries.length) return null;
  const timed = hs.kind === "score";
  return (
    <section className="highscores">
      <h2>🏅 {t("High scores")}</h2>
      <small className="muted">{timed ? t("Fastest to {n} points, same settings.", { n: state.config.playTo.kind === "score" ? state.config.playTo.target : 0 }) : t("Most points in {n} rounds, same settings.", { n: state.config.playTo.kind === "rounds" ? state.config.playTo.rounds : 0 })}</small>
      <ol>
        {hs.entries.map((e, i) => (
          <li key={e.id} className={hs.mine.includes(e.id) ? "mine" : ""}>
            <b>{i + 1}</b><span>{e.name}</span><em>{timed ? fmtTime(e.timeMs ?? 0) : e.score}</em><small>{new Date(e.at).toLocaleDateString()}</small>
          </li>
        ))}
      </ol>
      {timed && final !== null && <small className="muted">{t("This game: {time}", { time: fmtTime(final) })}</small>}
    </section>
  );
}
