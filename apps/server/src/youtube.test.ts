import { describe, expect, it } from "vitest";
import { parseDuration, parsePlaylistId, parseVideo, YouTubeApi, YouTubeProvider } from "./youtube";

describe("youtube", () => {
  it("finds the playlist id in links", () => {
    expect(parsePlaylistId("https://www.youtube.com/playlist?list=PLabcdefghijk123")).toBe("PLabcdefghijk123");
    expect(parsePlaylistId("https://www.youtube.com/watch?v=xyz&list=PLabcdefghijk123")).toBe("PLabcdefghijk123");
    expect(parsePlaylistId("https://music.youtube.com/playlist?list=PLabcdefghijk123")).toBe("PLabcdefghijk123");
    expect(parsePlaylistId("PLabcdefghijk123")).toBe("PLabcdefghijk123");
    expect(parsePlaylistId("https://example.com/?list=PLabcdefghijk123")).toBeNull();
    expect(parsePlaylistId("hello")).toBeNull();
  });
  it("parses ISO durations", () => {
    expect(parseDuration("PT3M25S")).toBe(205_000);
    expect(parseDuration("PT1H2M")).toBe(3_720_000);
    expect(parseDuration("P0D")).toBe(0);
  });
  it("gets title and artist from a video", () => {
    expect(parseVideo("Bohemian Rhapsody", "Queen - Topic")).toEqual({ title: "Bohemian Rhapsody", artists: ["Queen"] });
    expect(parseVideo("Queen - Bohemian Rhapsody (Official Video Remastered)", "Queen Official")).toEqual({ title: "Bohemian Rhapsody", artists: ["Queen"] });
    expect(parseVideo("Daft Punk – Get Lucky [Lyrics]", "x")).toEqual({ title: "Get Lucky", artists: ["Daft Punk"] });
    expect(parseVideo("Shape of You", "Ed Sheeran VEVO")).toEqual({ title: "Shape of You", artists: ["Ed Sheeran"] });
    expect(parseVideo("Something", "")).toBeNull();
  });
  it("loads embeddable tracks and skips the rest", async () => {
    const fetcher = (async (url: string) => {
      const path = new URL(url).pathname;
      const body = path.endsWith("playlistItems")
        ? { items: [{ contentDetails: { videoId: "a" } }, { contentDetails: { videoId: "b" } }, { contentDetails: { videoId: "c" } }] }
        : { items: [
            { id: "a", snippet: { title: "Song A", channelTitle: "Band - Topic", liveBroadcastContent: "none", publishedAt: "2019-01-01T00:00:00Z", thumbnails: {} }, contentDetails: { duration: "PT3M" }, status: { embeddable: true } },
            { id: "b", snippet: { title: "B", channelTitle: "Band - Topic", liveBroadcastContent: "none", thumbnails: {} }, contentDetails: { duration: "PT3M" }, status: { embeddable: false } },
            { id: "c", snippet: { title: "C", channelTitle: "Band - Topic", liveBroadcastContent: "none", thumbnails: {} }, contentDetails: { duration: "PT10S" }, status: { embeddable: true } },
          ] };
      return { ok: true, json: async () => body } as Response;
    }) as unknown as typeof fetch;
    const p = new YouTubeProvider(new YouTubeApi("k", fetcher), ["PLx"]);
    const tracks = await p.loadTracks();
    expect(tracks.map((t) => t.id)).toEqual(["a"]);
    expect(tracks[0]).toMatchObject({ title: "Song A", artists: ["Band"], durationMs: 180_000, year: "2019" });
  });
  it("turns playback into player commands", async () => {
    const p = new YouTubeProvider(new YouTubeApi("k"), []);
    const got: unknown[] = [];
    p.emit = (c) => got.push(c);
    const t = { id: "a", uri: "a", title: "t", artists: [], durationMs: 1 };
    await p.play(t, 5000); await p.pause(); await p.resume(t, 7000);
    expect(got).toEqual([{ op: "play", videoId: "a", startMs: 5000 }, { op: "pause" }, { op: "resume", videoId: "a", positionMs: 7000 }]);
  });
});
