import { describe, expect, it } from "vitest";
import { suggest } from "./suggest";

const list = ["Billie Jean", "Bohemian Rhapsody", "Beat It", "Michael Jackson", "Queen", "Beyoncé"];

describe("suggest", () => {
  it("completes the word being typed", () => {
    const s = suggest("billie je", list);
    expect(s.map((x) => x.text)).toContain("Billie Jean");
    expect(suggest("bo", list).map((x) => x.label)).toContain("Bohemian");
  });
  it("completes a word and keeps what was typed before it", () => {
    expect(suggest("michael jack", list).find((x) => x.label === "Jackson")!.text).toBe("michael Jackson ");
  });
  it("ignores accents and case", () => {
    expect(suggest("beyon", list).map((x) => x.label)).toContain("Beyoncé");
  });
  it("suggests nothing for empty text or after a space or a complete word", () => {
    expect(suggest("", list)).toEqual([]);
    expect(suggest("queen ", list)).toEqual([]);
    expect(suggest("queen", list)).toEqual([]);
  });
  it("is limited", () => {
    expect(suggest("b", list, 3).length).toBeLessThanOrEqual(3);
  });
});
