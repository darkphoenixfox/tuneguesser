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

export interface Multiplier {
  label: string;
  x: number;
}

/**
 * Score multipliers (when the host enables them).
 * - both: title and artist found in the same answer: ×1.5
 * - streak: the player scored in `streak` consecutive earlier rounds: +0.25 per round, up to ×2
 */
export function multipliersFor(opts: { both: boolean; streak: number }): Multiplier[] {
  const out: Multiplier[] = [];
  if (opts.both) out.push({ label: "Title + artist at once", x: 1.5 });
  if (opts.streak > 0) out.push({ label: `${opts.streak + 1} rounds in a row`, x: 1 + 0.25 * Math.min(4, opts.streak) });
  return out;
}

export const totalMultiplier = (ms: Multiplier[]) => ms.reduce((a, m) => a * m.x, 1);
