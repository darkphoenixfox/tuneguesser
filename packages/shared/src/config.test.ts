import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, commonSingleArtist, decodeSeed, encodeSeed, sanitizeConfig } from "./config";
import { hintText, letterPositions, maskText, revealCount } from "./hints";
import { multipliersFor, totalMultiplier } from "./scoring";

describe("sanitizeConfig", () => {
  it("returns the defaults for garbage", () => {
    expect(sanitizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig("x")).toEqual(DEFAULT_CONFIG);
  });
  it("clamps numbers and rejects unknown options", () => {
    const c = sanitizeConfig({ attempts: 99, roundSeconds: 3, order: "nope", hints: { trivia: true, art: true, bogus: 1 }, playTo: { kind: "score", target: 10 } });
    expect(c.attempts).toBe(5);
    expect(c.roundSeconds).toBe(10);
    expect(c.order).toBe("buzzer");
    expect(c.hints).toEqual({ reveal: false, trivia: true, art: true });
    expect(c.playTo).toEqual({ kind: "score", target: 500 });
  });
  it("still accepts the old single-choice hint value", () => {
    expect(sanitizeConfig({ hints: "reveal" }).hints).toEqual({ reveal: true, trivia: false, art: false });
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
  it("reveals evenly and shows every letter by the end of the timer", () => {
    expect(revealCount(0, 10)).toBe(0);
    expect(revealCount(0.475, 10)).toBe(5);
    expect(revealCount(0.95, 10)).toBe(10);
    expect(revealCount(1, 10)).toBe(10);
    expect(revealCount(5, 10)).toBe(10);
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

describe("commonSingleArtist", () => {
  it("is set only when every playlist is single-artist and it is the same artist", () => {
    expect(commonSingleArtist(["U2"])).toBe("U2");
    expect(commonSingleArtist(["U2", "u2 "])).toBe("U2");
    expect(commonSingleArtist(["U2", "Prince"])).toBeNull();
    expect(commonSingleArtist(["U2", undefined])).toBeNull();
    expect(commonSingleArtist([])).toBeNull();
  });
});

describe("seed", () => {
  it("round-trips playlists and rules, whatever the order of the playlists", () => {
    const c = sanitizeConfig({ ...DEFAULT_CONFIG, playTo: { kind: "score", target: 3000 }, hints: { reveal: false, trivia: true, art: false }, roundSeconds: null, answers: "choice", start: "beginning", attempts: 2, multipliers: false, guess: "title" });
    const seed = encodeSeed(["PLbbbbbbbb", "PLaaaaaaaa"], c);
    expect(seed).toBe(encodeSeed(["PLaaaaaaaa", "PLbbbbbbbb"], c));
    const d = decodeSeed(`https://tune.example/?seed=${seed}`)!; // a pasted link works too
    expect(d.playlists).toEqual(["PLaaaaaaaa", "PLbbbbbbbb"]);
    expect(sanitizeConfig({ ...DEFAULT_CONFIG, ...d.config })).toEqual(c);
  });
  it("rejects nonsense", () => {
    expect(decodeSeed("hello")).toBeNull();
    expect(decodeSeed("TG1-!!!")).toBeNull();
    expect(decodeSeed("TG1-" + btoa("[[]]"))).toBeNull();
  });
});
