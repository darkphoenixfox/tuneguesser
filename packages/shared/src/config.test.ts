import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, sanitizeConfig } from "./config";
import { hintText, letterPositions, maskText, revealCount } from "./hints";
import { multipliersFor, totalMultiplier } from "./scoring";

describe("sanitizeConfig", () => {
  it("returns the defaults for garbage", () => {
    expect(sanitizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig("x")).toEqual(DEFAULT_CONFIG);
  });
  it("clamps numbers and rejects unknown options", () => {
    const c = sanitizeConfig({ attempts: 99, roundSeconds: 3, order: "nope", hints: "trivia", playTo: { kind: "score", target: 10 } });
    expect(c.attempts).toBe(5);
    expect(c.roundSeconds).toBe(10);
    expect(c.order).toBe("buzzer");
    expect(c.hints).toBe("trivia");
    expect(c.playTo).toEqual({ kind: "score", target: 500 });
  });
  it("supports an unlimited timer and turning options off", () => {
    const c = sanitizeConfig({ roundSeconds: null, multipliers: false, autoAdvance: false });
    expect(c.roundSeconds).toBeNull();
    expect(c.multipliers).toBe(false);
    expect(c.autoAdvance).toBe(false);
  });
});

describe("reveal hint", () => {
  it("uses the title players would type", () => {
    expect(hintText("Get Lucky (feat. Pharrell Williams)")).toBe("Get Lucky");
    expect(hintText("Hey Jude - Remastered 2015")).toBe("Hey Jude");
  });
  it("masks letters only and reveals chosen positions", () => {
    const text = "Hey Jude!";
    const order = letterPositions(text); // 0,1,2,4,5,6,7
    expect(maskText(text, order, 0)).toBe("___ ____!");
    expect(maskText(text, order, 2)).toBe("He_ ____!");
    expect(maskText(text, [...order].reverse(), 2)).toBe("___ __de!");
  });
  it("reveals gradually, never more than 60% of the letters", () => {
    expect(revealCount(0, 10)).toBe(0);
    expect(revealCount(0.5, 10)).toBe(3);
    expect(revealCount(1, 10)).toBe(6);
    expect(revealCount(5, 10)).toBe(6);
  });
});

describe("multipliers", () => {
  it("both at once is x1.5 and streaks add 0.25 per round up to x2", () => {
    expect(multipliersFor({ both: false, streak: 0 })).toEqual([]);
    expect(totalMultiplier(multipliersFor({ both: true, streak: 0 }))).toBe(1.5);
    expect(totalMultiplier(multipliersFor({ both: false, streak: 2 }))).toBe(1.5);
    expect(totalMultiplier(multipliersFor({ both: false, streak: 9 }))).toBe(2);
    expect(totalMultiplier(multipliersFor({ both: true, streak: 4 }))).toBe(3);
    expect(multipliersFor({ both: false, streak: 2 })[0]!.label).toBe("3 rounds in a row");
  });
});
