/** Everything the host picks on the "Host a game" page. */
export interface GameConfig {
  playTo: { kind: "rounds"; rounds: number } | { kind: "score"; target: number };
  /** buzzer: first to press ANSWER. roundRobin: each song belongs to one player in turn, who must guess or skip. */
  order: "buzzer" | "roundRobin";
  /** what has to be guessed: the song title, the artist, or both (handy for single-artist playlists) */
  guess: "both" | "title" | "artist";
  answers: "type" | "choice";
  /** any combination: letters revealed over time, trivia facts, pixelated artwork that sharpens */
  hints: { reveal: boolean; trivia: boolean; art: boolean };
  /** seconds per song; null = unlimited (the round lasts until the song ends) */
  roundSeconds: number | null;
  /** wrong answers allowed per player per round (1 to 5) */
  attempts: number;
  /** extra points for title+artist in one answer and for streaks */
  multipliers: boolean;
  /** when a round has ended: false = hold the screen (song plays on) until the host continues or the song ends */
  autoAdvance: boolean;
  /** where each song starts: its beginning, or a random point */
  start: "beginning" | "random";
}

export const DEFAULT_CONFIG: GameConfig = {
  playTo: { kind: "rounds", rounds: 10 },
  order: "buzzer",
  guess: "both",
  answers: "type",
  hints: { reveal: false, trivia: false, art: false },
  roundSeconds: 40,
  attempts: 3,
  multipliers: true,
  autoAdvance: true,
  start: "random",
};

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

/** Accepts the object form, or the old single-choice string ("none" | "reveal" | "trivia"). */
function sanitizeHints(raw: unknown): GameConfig["hints"] {
  if (typeof raw === "string") return { reveal: raw === "reveal", trivia: raw === "trivia", art: false };
  const h = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { reveal: h.reveal === true, trivia: h.trivia === true, art: h.art === true };
}

/** Turns untrusted input from the browser into a valid config. */
export function sanitizeConfig(raw: unknown): GameConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const playTo: GameConfig["playTo"] =
    r.playTo?.kind === "score"
      ? { kind: "score", target: num(r.playTo.target, 500, 100_000, 5000) }
      : { kind: "rounds", rounds: num(r.playTo?.rounds, 1, 100, 10) };
  return {
    playTo,
    order: pick(r.order, ["buzzer", "roundRobin"] as const, "buzzer"),
    guess: pick(r.guess, ["both", "title", "artist"] as const, "both"),
    answers: pick(r.answers, ["type", "choice"] as const, "type"),
    hints: sanitizeHints(r.hints),
    roundSeconds: r.roundSeconds === null ? null : num(r.roundSeconds, 10, 120, 40),
    attempts: num(r.attempts, 1, 5, 3),
    multipliers: r.multipliers !== false,
    autoAdvance: r.autoAdvance !== false,
    start: pick(r.start, ["beginning", "random"] as const, "random"),
  };
}
