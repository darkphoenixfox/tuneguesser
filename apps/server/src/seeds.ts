import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { decodeSeed } from "@tuneguesser/shared";

const MAX = 5000;

/**
 * Short names for challenge seeds: "TG-" + 8 characters derived from the full seed, so the same playlists and rules always
 * get the same short seed. The full seed is kept in DATA_DIR/seeds.json (shared by both blue/green servers).
 */
export class SeedStore {
  constructor(private file: string) {}

  private read(): Record<string, string> {
    try { return JSON.parse(fs.readFileSync(this.file, "utf-8")) as Record<string, string>; } catch { return {}; }
  }

  /** Returns the short seed for a valid full seed, or null. */
  shorten(full: string): string | null {
    if (typeof full !== "string" || full.length > 1500 || !decodeSeed(full)) return null;
    const code = "TG-" + createHash("sha256").update(full).digest("base64url").slice(0, 8);
    const all = this.read();
    if (!all[code]) {
      if (Object.keys(all).length >= MAX) return null;
      all[code] = full;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(all));
        fs.renameSync(tmp, this.file);
      } catch (e) { console.warn("could not save seeds:", (e as Error).message); return null; }
    }
    return code;
  }

  full(code: string): string | null { return this.read()[code] ?? null; }
}
