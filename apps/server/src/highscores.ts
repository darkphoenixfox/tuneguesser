import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { GameConfig, HighScoreEntry, HighScores } from "@tuneguesser/shared";

const KEEP = 20; // per table
const SHOW = 10;

/**
 * Results are only comparable between games with the same rules, so each combination of these settings has its own table:
 * playlists, scoring (rounds / target and how many), hints, timer, type or choice, start of the song, attempts, multipliers
 * (plus what is guessed and the play order, which change the game just as much).
 */
export function categoryKey(source: string, playlistIds: string[], c: GameConfig): string {
  return JSON.stringify([
    source,
    [...new Set(playlistIds)].sort(),
    c.playTo.kind === "rounds" ? ["rounds", c.playTo.rounds] : ["score", c.playTo.target],
    [c.hints.reveal, c.hints.trivia, c.hints.art],
    c.roundSeconds,
    c.answers,
    c.start,
    c.attempts,
    c.multipliers,
    c.guess,
    c.order,
  ]);
}

/** Kept in a JSON file (DATA_DIR/highscores.json, shared by both blue/green servers: re-read before every use). */
export class HighScoreStore {
  constructor(private file: string) {}

  private read(): Record<string, HighScoreEntry[]> {
    try { return JSON.parse(fs.readFileSync(this.file, "utf-8")) as Record<string, HighScoreEntry[]>; } catch { return {}; }
  }
  private write(d: Record<string, HighScoreEntry[]>) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(d));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.warn("could not save high scores:", (e as Error).message); }
  }

  /** Adds results to the table of `key` and returns the table. */
  add(key: string, kind: "rounds" | "score", results: Array<{ name: string; score: number; timeMs?: number }>): HighScores {
    const all = this.read();
    const now = Date.now();
    const added: HighScoreEntry[] = results.map((r) => ({ id: randomBytes(6).toString("hex"), name: r.name.slice(0, 24), score: r.score, timeMs: r.timeMs, at: now }));
    const list = sort(kind, [...(all[key] ?? []), ...added]).slice(0, KEEP);
    if (added.length) { all[key] = list; this.write(all); }
    return { kind, entries: list.slice(0, SHOW), mine: added.map((e) => e.id).filter((id) => list.slice(0, SHOW).some((e) => e.id === id)) };
  }
}

function sort(kind: "rounds" | "score", l: HighScoreEntry[]): HighScoreEntry[] {
  return l.sort((a, b) => (kind === "rounds" ? b.score - a.score : (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity)) || a.at - b.at);
}
