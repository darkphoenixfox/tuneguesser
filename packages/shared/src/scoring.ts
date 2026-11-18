export interface ScoreConfig {
  /** max points for a correct title, scaled by remaining time */
  titleMax: number;
  artistMax: number;
  /** fraction of max points always awarded for a correct answer, however late */
  floor: number;
}

export const DEFAULT_SCORE: ScoreConfig = { titleMax: 1000, artistMax: 500, floor: 0.2 };

/** Faster = more points. Linear from max (instant) down to floor*max at the deadline. */
export function pointsFor(max: number, elapsedMs: number, roundMs: number, floor = DEFAULT_SCORE.floor): number {
  if (elapsedMs < 0 || elapsedMs > roundMs) return 0;
  const left = 1 - elapsedMs / roundMs;
  return Math.round(max * (floor + (1 - floor) * left));
}
