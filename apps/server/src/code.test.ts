import { describe, expect, it } from "vitest";
import { makeRoomCode, slotOfCode } from "./code";

describe("room codes", () => {
  it("start in the slot's half of the alphabet", () => {
    for (let i = 0; i < 300; i++) {
      expect(makeRoomCode("a")).toMatch(/^[A-M][A-Z]{3}$/);
      expect(makeRoomCode("b")).toMatch(/^[N-Z][A-Z]{3}$/);
      expect(slotOfCode(makeRoomCode("a"))).toBe("a");
      expect(slotOfCode(makeRoomCode("b"))).toBe("b");
    }
  });
  it("any letter without a slot", () => {
    const first = new Set(Array.from({ length: 400 }, () => makeRoomCode(undefined)[0]));
    expect(first.size).toBeGreaterThan(15);
  });
});
