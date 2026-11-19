import { describe, expect, it } from "vitest";
import { cleanFeat } from "./feat";

const t = (title: string, artists: string[]) => ({ id: "x", uri: "x", title, artists, durationMs: 1 });
const f = (title: string, artists: string[]) => { const r = cleanFeat(t(title, artists)); return [r.title, r.artists]; };

describe("cleanFeat", () => {
  it("removes the feature from the title and adds the artist when missing", () => {
    expect(f("Seven (feat. Latto)", ["Jung Kook"])).toEqual(["Seven", ["Jung Kook", "Latto"]]);
    expect(f("Seven [ft. Latto]", ["Jung Kook"])).toEqual(["Seven", ["Jung Kook", "Latto"]]);
    expect(f("Get Lucky (feat. Pharrell Williams & Nile Rodgers)", ["Daft Punk"])).toEqual(["Get Lucky", ["Daft Punk", "Pharrell Williams", "Nile Rodgers"]]);
    expect(f("Song ft. Someone", ["A"])).toEqual(["Song", ["A", "Someone"]]);
    expect(f("Song - feat. Someone", ["A"])).toEqual(["Song", ["A", "Someone"]]);
    expect(f("Song (with Other) (Remastered)", ["A"])).toEqual(["Song (Remastered)", ["A", "Other"]]);
  });
  it("does not add an artist that is already credited", () => {
    expect(f("Seven (feat. Latto)", ["Jung Kook", "latto"])).toEqual(["Seven", ["Jung Kook", "latto"]]);
  });
  it("leaves other titles alone", () => {
    expect(f("Without Me", ["Eminem"])).toEqual(["Without Me", ["Eminem"]]);
    expect(f("Come Together (Remastered 2009)", ["The Beatles"])).toEqual(["Come Together (Remastered 2009)", ["The Beatles"]]);
    expect(f("(feat. X)", ["A"])).toEqual(["(feat. X)", ["A"]]); // never an empty title
  });
});
