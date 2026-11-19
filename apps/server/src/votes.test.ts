import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VoteStore } from "./votes";

const store = () => new VoteStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "votes-")), "votes.json"));
const voters = Array.from({ length: 6 }, (_, i) => `voter-number-${i}`);

describe("song votes", () => {
  it("blacklists a song after MORE than 3 distinct thumbs down", () => {
    const s = store();
    for (const v of voters.slice(0, 3)) expect(s.vote("a", v, -1).blacklisted).toBe(false);
    expect(s.blacklisted().has("a")).toBe(false);
    expect(s.vote("a", voters[3]!, -1).blacklisted).toBe(true);
    expect(s.blacklisted().has("a")).toBe(true);
  });
  it("one voter counts once, can change or take back a vote", () => {
    const s = store();
    for (let i = 0; i < 10; i++) s.vote("a", voters[0]!, -1);
    expect(s.blacklisted().has("a")).toBe(false);
    for (const v of voters.slice(1, 4)) s.vote("a", v, -1);
    expect(s.blacklisted().has("a")).toBe(true);
    s.vote("a", voters[0]!, 1); // changed to thumbs up
    expect(s.blacklisted().has("a")).toBe(false);
    s.vote("a", voters[0]!, 0);
    expect(s.blacklisted().size).toBe(0);
  });
  it("ignores malformed voter ids and survives a missing file", () => {
    const s = store();
    expect(s.blacklisted().size).toBe(0);
    for (let i = 0; i < 6; i++) s.vote("a", `x${i}`, -1); // too short
    expect(s.blacklisted().size).toBe(0);
  });
});
