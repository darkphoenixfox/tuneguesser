import { describe, expect, it } from "vitest";
import { matchArtist, matchTitle, normalize } from "./matching";

describe("normalize", () => {
  it("strips case, accents and punctuation", () => {
    expect(normalize("Beyoncé – Halo!")).toBe("beyonce halo");
    expect(normalize("Guns N' Roses")).toBe("guns n roses");
  });
});

describe("matchTitle", () => {
  it("accepts exact and case-insensitive", () => {
    expect(matchTitle("bohemian rhapsody", "Bohemian Rhapsody")).toBe(true);
  });
  it("tolerates small typos but not on short words", () => {
    expect(matchTitle("bohemain rapsody", "Bohemian Rhapsody")).toBe(true);
    expect(matchTitle("cat", "Car")).toBe(false);
  });
  it("accepts title without parenthesis", () => {
    expect(matchTitle("Yesterday", "Yesterday (Remastered 2009)")).toBe(true);
    expect(matchTitle("Under Pressure", "Under Pressure [Live Aid]")).toBe(true);
  });
  it("accepts title without ' - Remastered' suffix", () => {
    expect(matchTitle("Hotel California", "Hotel California - 2013 Remaster")).toBe(true);
  });
  it("accepts title without feat. credit", () => {
    expect(matchTitle("Get Lucky", "Get Lucky (feat. Pharrell Williams)")).toBe(true);
    expect(matchTitle("Get Lucky", "Get Lucky - feat. Pharrell")).toBe(true);
  });
  it("ignores leading 'the'", () => {
    expect(matchTitle("Wall", "The Wall")).toBe(true);
  });
  it("rejects wrong titles and empty input", () => {
    expect(matchTitle("Imagine", "Yesterday")).toBe(false);
    expect(matchTitle("", "Yesterday")).toBe(false);
  });
  it("is strict on digits", () => {
    expect(matchTitle("Song 2", "Song 3")).toBe(false);
  });
});

describe("matchArtist", () => {
  it("accepts main artist only when there are features", () => {
    expect(matchArtist("Daft Punk", ["Daft Punk", "Pharrell Williams"])).toBe(true);
  });
  it("accepts any single credited artist", () => {
    expect(matchArtist("Pharrell", ["Daft Punk", "Pharrell Williams"])).toBe(false); // partial name too far
    expect(matchArtist("Pharrell Williams", ["Daft Punk", "Pharrell Williams"])).toBe(true);
  });
  it("accepts multiple artists typed together", () => {
    expect(matchArtist("Daft Punk ft. Pharrell Williams", ["Daft Punk", "Pharrell Williams"])).toBe(true);
    expect(matchArtist("daft punk & pharrell williams", ["Daft Punk", "Pharrell Williams"])).toBe(true);
  });
  it("ignores 'the' and tolerates typos", () => {
    expect(matchArtist("Beatles", ["The Beatles"])).toBe(true);
    expect(matchArtist("The Beatels", ["The Beatles"])).toBe(true);
  });
  it("rejects wrong artist", () => {
    expect(matchArtist("Queen", ["The Beatles"])).toBe(false);
  });
});
