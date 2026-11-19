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
    expect(parseVideo('" Kiss Me " - " There She Goes " Version (Official)', "Sixpence None The Richer")).toEqual({ title: "Kiss Me", artists: ["Sixpence None The Richer"] });
    expect(parseVideo('"Kiss Me"', "Sixpence None The Richer")).toEqual({ title: "Kiss Me", artists: ["Sixpence None The Richer"] });
    expect(parseVideo("Cheap Trick-I Want You To Want Me Lyrics", "x")).toMatchObject({ title: "I Want You To Want Me", artists: ["Cheap Trick"] });
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

describe("listeners joining mid-song", () => {
  it("snapshot continues where the song is, and is empty when paused", async () => {
    const p = new YouTubeProvider(new YouTubeApi("k"), []);
    const t = { id: "a", uri: "a", title: "t", artists: [], durationMs: 1 };
    expect(p.snapshot()).toBeNull();
    await p.play(t, 10_000);
    expect(p.snapshot()).toMatchObject({ op: "play", videoId: "a" });
    expect((p.snapshot() as { startMs: number }).startMs).toBeGreaterThanOrEqual(10_000);
    await p.pause();
    expect(p.snapshot()).toBeNull();
  });
  it("splits the messy titles found in the default playlists", () => {
    expect(parseVideo('Numb (Official Music Video) [4K UPGRADE] – Linkin Park', 'Linkin Park')).toEqual({ title: 'Numb', artists: ['Linkin Park'] });
    expect(parseVideo('In The End [Mellen Gi Remix] feat. Fleurie - Tommee Profitt', 'Tommee Profitt')).toEqual({ title: 'In The End [Mellen Gi Remix] feat. Fleurie', artists: ['Tommee Profitt'] });
    expect(parseVideo('Scatman (ski-ba-bop-ba-dop-bop) Official Video HD - Scatman John', 'Scatman John Official YouTube Channel')).toEqual({ title: 'Scatman (ski-ba-bop-ba-dop-bop)', artists: ['Scatman John'] });
    expect(parseVideo("8 Letters - Why Don't We [Official Music Video]", "Why Don't We")).toEqual({ title: '8 Letters', artists: ["Why Don't We"] });
    expect(parseVideo('The Beatles - The Beatles - Hey Jude (Official Music Video) [Remastered 2015]', 'TheBeatlesVEVO')).toEqual({ title: 'Hey Jude', artists: ['The Beatles'] });
    expect(parseVideo('Metallica: Enter Sandman (Official Music Video)', 'Metallica')).toEqual({ title: 'Enter Sandman', artists: ['Metallica'] });
    expect(parseVideo('Panic! At The Disco: I Write Sins Not Tragedies [OFFICIAL VIDEO]', 'Fueled By Ramen')).toEqual({ title: 'I Write Sins Not Tragedies', artists: ['Panic! At The Disco'] });
    expect(parseVideo('Passenger | Let Her Go (Official Video)', 'Passenger')).toEqual({ title: 'Let Her Go', artists: ['Passenger'] });
    expect(parseVideo('Dynasty (Official Music Video) | MIIA', 'MIIA')).toEqual({ title: 'Dynasty', artists: ['MIIA'] });
    expect(parseVideo('Limp Bizkit "Behind Blue Eyes"', 'limpbizkit')).toEqual({ title: 'Behind Blue Eyes', artists: ['Limp Bizkit'] });
    expect(parseVideo('Neil Diamond "Sweet Caroline" on The Ed Sullivan Show', 'The Ed Sullivan Show')).toEqual({ title: 'Sweet Caroline', artists: ['Neil Diamond'] });
    expect(parseVideo('Alok, SOMETHING ELSE– I Wonder If You Know (Official Lyric Video)', 'Alok')).toEqual({ title: 'I Wonder If You Know', artists: ['Alok', 'SOMETHING ELSE'] });
    expect(parseVideo('MIRA - Ring, Ring | Official Video', 'MIRA')).toEqual({ title: 'Ring, Ring', artists: ['MIRA'] });
    expect(parseVideo('Smiley - Let Me Go | Official Visualiser', 'Smiley')).toEqual({ title: 'Let Me Go', artists: ['Smiley'] });
    expect(parseVideo('Calvin Harris ft. Rihanna - This Is What You Came For (Lyrics) HD', 'BestYoutubeVideos')).toEqual({ title: 'This Is What You Came For', artists: ['Calvin Harris', 'Rihanna'] });
    expect(parseVideo('Mr. Big - To Be With You 4K Video', 'MrBigVEVO')).toEqual({ title: 'To Be With You', artists: ['Mr. Big'] });
    expect(parseVideo('Marshmello & Anne-Marie - FRIENDS (Music Video) *OFFICIAL FRIENDZONE ANTHEM*', 'Marshmello')).toEqual({ title: 'FRIENDS', artists: ['Marshmello', 'Anne-Marie'] });
    expect(parseVideo('Lynyrd Skynyrd - Simple Man - Live At The Florida Theatre / 2015', 'LynyrdSkynyrdVEVO')).toEqual({ title: 'Simple Man', artists: ['Lynyrd Skynyrd'] });
    expect(parseVideo('Rednex - Cotton Eye Joe (Official Music Video) [HD] - RednexMusic com', 'Rednex Videos')).toEqual({ title: 'Cotton Eye Joe', artists: ['Rednex'] });
    expect(parseVideo('BLACK SABBATH - "Paranoid" (Official Video)', 'Black Sabbath')).toEqual({ title: 'Paranoid', artists: ['BLACK SABBATH'] });
    expect(parseVideo('Alan Walker - Lily ft. K-391 & Emelie Hollow (Official Lyric Video)', 'K-391')).toEqual({ title: 'Lily ft. K-391 & Emelie Hollow', artists: ['Alan Walker'] });
  });
});
