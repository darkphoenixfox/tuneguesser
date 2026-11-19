import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EditStore, hasArtist } from "./edits";

const track = (id: string, title: string, artists: string[]) => ({ id, uri: id, title, artists, durationMs: 1 });

describe("EditStore", () => {
  const store = () => new EditStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ed-")), "e.json"));

  it("corrects titles and artists, and can undo it", () => {
    const s = store();
    s.editTrack("abcdefghijk", { title: "  Gloria ", artists: ["U2"] });
    expect(s.apply([track("abcdefghijk", "gloria / solano", ["x"]), track("zzzzzzzzzzz", "Other", ["y"])]).map((t) => [t.title, t.artists])).toEqual([["Gloria", ["U2"]], ["Other", ["y"]]]);
    s.editTrack("abcdefghijk", null);
    expect(s.apply([track("abcdefghijk", "keep", ["x"])])[0]!.title).toBe("keep");
  });

  it("keeps a playlist's one-artist setting", () => {
    const s = store();
    s.setArtist("PLabcdef123", "U2");
    expect(s.playlist("PLabcdef123")).toEqual({ artist: "U2" });
    s.setArtist("PLabcdef123", null);
    expect(s.playlist("PLabcdef123")).toEqual({});
    expect(hasArtist(track("a", "t", ["Bono", "u2"]), " U2")).toBe(true);
  });
});
