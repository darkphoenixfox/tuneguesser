import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, encodeSeed } from "@tuneguesser/shared";
import { SeedStore } from "./seeds";

describe("SeedStore", () => {
  it("gives the same short seed to the same full seed and can look it up", () => {
    const s = new SeedStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sd-")), "s.json"));
    const full = encodeSeed(["PLaaaaaaaa", "PLbbbbbbbb"], DEFAULT_CONFIG);
    const code = s.shorten(full)!;
    expect(code).toMatch(/^TG-[\w-]{8}$/);
    expect(s.shorten(full)).toBe(code);
    expect(s.full(code)).toBe(full);
    expect(s.shorten("TG1-junk")).toBeNull();
    expect(s.full("TG-nothere1")).toBeNull();
  });
});
