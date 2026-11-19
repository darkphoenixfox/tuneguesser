import { describe, expect, it } from "vitest";
import { TriviaCache, artistFacts, triviaFor } from "./trivia";

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
const track = { id: "1", uri: "u", title: "Bohemian Rhapsody", artists: ["Queen"], durationMs: 1, year: "1975" };

const okFetch = (async (url: string) => {
  const u = String(url);
  if (u.includes("musicbrainz")) return json({ artists: [
    { name: "Queen", score: 100, type: "Group", area: { name: "United Kingdom" }, "life-span": { begin: "1970" }, tags: [{ name: "rock", count: 9 }, { name: "glam rock", count: 5 }, { name: "pop", count: 1 }, { name: "opera", count: 0 }] },
  ] });
  if (u.includes("search/title")) return json({ pages: [{ key: "Queen_(band)" }] });
  if (u.includes("page/summary")) return json({ type: "standard", description: "British rock band", extract: "Queen are a British rock band formed in London in 1970 (originally Smile). Their line-up..." });
  return new Response("", { status: 404 });
}) as unknown as typeof fetch;

describe("trivia", () => {
  it("builds facts from MusicBrainz, the release year and Wikipedia, vaguest first, hiding the name", async () => {
    const facts = await triviaFor(track, okFetch);
    expect(facts).toEqual([
      "Genre: rock, glam rock, pop",
      "A group from United Kingdom",
      "Formed in 1970",
      "This song came out in 1975",
      "this artist are a British rock band formed in London in 1970.",
    ]);
    expect(facts.join(" ")).not.toMatch(/queen/i);
  });

  it("ignores a search result for a different artist", async () => {
    const f = (async (url: string) => String(url).includes("musicbrainz") ? json({ artists: [{ name: "Queens of the Stone Age", score: 100 }] }) : new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await artistFacts("Queen", f)).toEqual({});
  });

  it("never throws: network failures just mean fewer facts", async () => {
    const f = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await triviaFor(track, f)).toEqual(["This song came out in 1975"]);
  });

  it("caches and prefetches", async () => {
    let calls = 0;
    const f = (async (...a: unknown[]) => { calls++; return (okFetch as any)(...a); }) as unknown as typeof fetch;
    const c = new TriviaCache(f);
    expect(c.peek(track)).toEqual([]); // not ready yet: the round does not wait
    await new Promise((r) => setTimeout(r, 20));
    expect(c.peek(track).length).toBe(5);
    expect(calls).toBe(3); // once, not again
  });

  it("keeps only genre-like MusicBrainz tags", async () => {
    const { isGenreTag } = await import("./trivia");
    for (const ok of ["rock", "glam rock", "new wave", "Hip Hop", "synth-pop", "r&b"]) expect(isGenreTag(ok), ok).toBe(true);
    for (const bad of ["2008 universal fire victim", "seen live", "american", "80s", "favorites"]) expect(isGenreTag(bad), bad).toBe(false);
  });
});
