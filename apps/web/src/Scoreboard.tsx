import type { RevealInfo, RoomState } from "@tuneguesser/shared";

/** Ranking with each player's score and, at the reveal, the points they just earned. */
export function Scoreboard({ state, reveal, meId }: { state: RoomState; reveal?: RevealInfo; meId?: string }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <ol className="board">
      {sorted.map((p, i) => {
        const g = reveal?.gains[p.id];
        const add = g ? g.title + g.artist : 0;
        return (
          <li key={p.id} className={(p.attemptsLeft === 0 && state.phase === "playing" ? "tried " : "") + (state.guesser?.id === p.id ? "guessing" : "") + (meId === p.id ? " me" : "")}>
            <span className="rank">{i + 1}</span>
            <span className="name">{p.name}</span>
            <span className="score">{p.score}</span>
            <span className="gain">{add > 0 ? `+${add}` : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact one-line scores (host gameplay screen): "Ana 1200 · Bo 800". */
export function ScoreLine({ state }: { state: RoomState }) {
  return (
    <div className="scoreline">
      {state.players.map((p) => (
        <span key={p.id} className={(state.guesser?.id === p.id ? "guessing " : "") + (state.activePlayerId === p.id ? "active " : "") + (p.connected ? "" : "gone")}>
          {p.name} <b>{p.score}</b>
        </span>
      ))}
    </div>
  );
}
