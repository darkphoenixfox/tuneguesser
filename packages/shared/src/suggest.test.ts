import { describe, expect, it } from "vitest";
import { suggest } from "./suggest";

const list = ["Billie Jean", "Bohemian Rhapsody", "Beat It", "Michael Jackson", "Queen", "Beyoncé"];

describe("suggest", () => {
  it("completes the word being typed", () => {
    const s = suggest("billie je", list);
    expect(s[0]!.label).toBe("Jean");
    expect(s[0]!.text).toBe("billie Jean ");
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
    expect(suggest("queen ", list)).toEqual([]);
  });
  it("never offers a whole multi-word title", () => {
    expect(suggest("bohemian rha", list).every((x) => !x.label.includes(" "))).toBe(true);
  });
  it("adds common English words after the playlist words", () => {
    const s = suggest("lo", list).map((x) => x.label);
    expect(s).toContain("love");
    const mixed = suggest("be", list).map((x) => x.label);
    expect(mixed.indexOf("Beat")).toBe(0); // playlist words first
    expect(mixed.length).toBeGreaterThan(2);
  });
  it("is limited", () => {
    expect(suggest("b", list, 3).length).toBeLessThanOrEqual(3);
  });
});
