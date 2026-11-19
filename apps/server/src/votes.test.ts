import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VoteStore } from "./votes";

const store = () => new VoteStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "votes-")), "votes.json"));

describe("song votes", () => {
  it("blacklists a song with a single thumbs down", () => {
    const s = store();
    expect(s.blacklisted().has("a")).toBe(false);
    expect(s.vote("a", "voter-number-1", -1).blacklisted).toBe(true);
    expect(s.blacklisted().has("a")).toBe(true);
    expect(s.blacklisted().has("b")).toBe(false);
  });
  it("a vote can be taken back", () => {
    const s = store();
    s.vote("a", "voter-number-1", -1);
    s.vote("a", "voter-number-1", 0);
    expect(s.blacklisted().size).toBe(0);
  });
  it("ignores malformed voter ids and survives a missing file", () => {
    const s = store();
    expect(s.blacklisted().size).toBe(0);
    s.vote("a", "x1", -1); // too short
    expect(s.blacklisted().size).toBe(0);
  });
});
