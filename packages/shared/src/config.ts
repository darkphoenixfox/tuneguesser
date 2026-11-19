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
  hints: { reveal: true, trivia: true, art: true },
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
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG.hints };
  const h = raw as Record<string, unknown>;
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

/**
 * Playlists can be marked as "one artist only". When every selected playlist is, and it is the same artist, guessing the
 * artist is pointless: returns that artist (otherwise null).
 */
export function commonSingleArtist(artists: Array<string | null | undefined>): string | null {
  if (!artists.length || artists.some((a) => !a)) return null;
  const first = String(artists[0]).trim().toLowerCase();
  return artists.every((a) => String(a).trim().toLowerCase() === first) ? String(artists[0]) : null;
}

/**
 * A seed is a short text that carries the playlists and the rules of a game. Whoever uses the same seed plays in the same
 * category (the same high-score table). Only what the high-score table is separated by is in it.
 */
export function encodeSeed(playlists: string[], c: GameConfig): string {
  const body = JSON.stringify([[...new Set(playlists)].sort(), c.playTo.kind === "rounds" ? ["r", c.playTo.rounds] : ["s", c.playTo.target], [c.hints.reveal, c.hints.trivia, c.hints.art].map(Number), c.roundSeconds, c.answers, c.start, c.attempts, Number(c.multipliers), c.guess, c.order]);
  return "TG1-" + btoa(body).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The playlists and settings of a seed (or of a link containing one); null when it is not valid. */
export function decodeSeed(text: string): { playlists: string[]; config: Pick<GameConfig, "playTo" | "hints" | "roundSeconds" | "answers" | "start" | "attempts" | "multipliers" | "guess" | "order"> } | null {
  try {
    const m = /TG1-([\w-]+)/.exec(text.trim());
    if (!m) return null;
    const a = JSON.parse(atob(m[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    if (!Array.isArray(a) || !Array.isArray(a[0])) return null;
    const playlists = (a[0] as unknown[]).filter((x): x is string => typeof x === "string" && /^[\w-]{6,64}$/.test(x)).slice(0, 10);
    if (!playlists.length) return null;
    const c = sanitizeConfig({
      playTo: a[1]?.[0] === "s" ? { kind: "score", target: a[1][1] } : { kind: "rounds", rounds: a[1]?.[1] },
      hints: { reveal: !!a[2]?.[0], trivia: !!a[2]?.[1], art: !!a[2]?.[2] },
      roundSeconds: a[3], answers: a[4], start: a[5], attempts: a[6], multipliers: !!a[7], guess: a[8], order: a[9],
    });
    return { playlists, config: { playTo: c.playTo, hints: c.hints, roundSeconds: c.roundSeconds, answers: c.answers, start: c.start, attempts: c.attempts, multipliers: c.multipliers, guess: c.guess, order: c.order } };
  } catch { return null; }
}
