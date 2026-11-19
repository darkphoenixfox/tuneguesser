import fs from "node:fs";
import path from "node:path";

/** Thumbs down on songs ("This song has issues"). A song with more than BLACKLIST_AFTER distinct thumbs-down voters is never played again: one is enough. */
export const BLACKLIST_AFTER = 0;

export interface VoteRecord { up: string[]; down: string[]; name?: string }

/**
 * Kept in a JSON file (DATA_DIR/votes.json, shared by both blue/green servers: it is re-read before every use).
 * Voters are anonymous random ids chosen by each browser, so one browser counts once per song.
 * To bring a song back, delete its entry from the file.
 */
export class VoteStore {
  constructor(private file: string) {}

  private read(): Record<string, VoteRecord> {
    try { return JSON.parse(fs.readFileSync(this.file, "utf-8")) as Record<string, VoteRecord>; } catch { return {}; }
  }
  private write(d: Record<string, VoteRecord>) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(d));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.warn("could not save votes:", (e as Error).message); }
  }

  /** `v`: 1 = thumbs up, -1 = thumbs down, 0 = take the vote back. Returns whether the song is now blacklisted. */
  vote(trackId: string, voter: string, v: 1 | -1 | 0, name?: string): { blacklisted: boolean } {
    if (!/^[\w-]{8,64}$/.test(voter) || !trackId) return { blacklisted: this.blacklisted().has(trackId) };
    const all = this.read();
    const r = all[trackId] ?? { up: [], down: [] };
    r.up = r.up.filter((x) => x !== voter);
    r.down = r.down.filter((x) => x !== voter);
    if (v === 1) r.up.push(voter);
    if (v === -1) r.down.push(voter);
    if (name) r.name = name.slice(0, 200);
    if (r.up.length || r.down.length) all[trackId] = r; else delete all[trackId];
    this.write(all);
    return { blacklisted: r.down.length > BLACKLIST_AFTER };
  }

  /** Brings a song back (removes all its thumbs down). */
  clear(trackId: string) {
    const all = this.read();
    if (all[trackId]) { delete all[trackId]; this.write(all); }
  }

  blacklisted(): Set<string> {
    return new Set(Object.entries(this.read()).filter(([, r]) => (r.down?.length ?? 0) > BLACKLIST_AFTER).map(([id]) => id));
  }
}
