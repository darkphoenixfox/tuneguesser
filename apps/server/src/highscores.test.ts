import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, sanitizeConfig } from "@tuneguesser/shared";
import { HighScoreStore, categoryKey } from "./highscores";

describe("high scores", () => {
  it("separates tables by every rule that changes the game", () => {
    const base = categoryKey("youtube", ["a", "b"], DEFAULT_CONFIG);
    expect(categoryKey("youtube", ["b", "a"], DEFAULT_CONFIG)).toBe(base); // order of playlists does not matter
    const changes: Array<Partial<typeof DEFAULT_CONFIG>> = [
      { playTo: { kind: "rounds", rounds: 11 } }, { playTo: { kind: "score", target: 5000 } },
      { hints: { reveal: false, trivia: true, art: true } }, { roundSeconds: 30 }, { roundSeconds: null }, { answers: "choice" },
      { start: "beginning" }, { attempts: 2 }, { multipliers: false },
    ];
    for (const c of changes) expect(categoryKey("youtube", ["a", "b"], sanitizeConfig({ ...DEFAULT_CONFIG, ...c })), JSON.stringify(c)).not.toBe(base);
    expect(categoryKey("youtube", ["a"], DEFAULT_CONFIG)).not.toBe(base);
    expect(categoryKey("spotify", ["a", "b"], DEFAULT_CONFIG)).not.toBe(base);
    expect(categoryKey("youtube", ["a", "b"], { ...DEFAULT_CONFIG, autoAdvance: false })).toBe(base); // not a scoring rule
  });

  it("ranks by points for rounds and by time for a target score", () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hs-")), "hs.json");
    const s = new HighScoreStore(f);
    s.add("r", "rounds", [{ name: "A", score: 500 }]);
    const r = s.add("r", "rounds", [{ name: "B", score: 900 }]);
    expect(r.entries.map((e) => e.name)).toEqual(["B", "A"]);
    expect(r.mine).toEqual([r.entries[0]!.id]);
    s.add("t", "score", [{ name: "Slow", score: 5000, timeMs: 300_000 }]);
    const t = new HighScoreStore(f).add("t", "score", [{ name: "Fast", score: 5100, timeMs: 120_000 }]); // a fresh store reads the same file
    expect(t.entries.map((e) => e.name)).toEqual(["Fast", "Slow"]);
  });
});
