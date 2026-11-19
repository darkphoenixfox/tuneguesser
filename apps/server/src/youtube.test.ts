import { describe, expect, it } from "vitest";
import { doubt, isLiveRecording, fixUploaderTitles, trackMeta, parseDuration, parsePlaylistId, parseVideo, YouTubeApi, YouTubeProvider } from "./youtube";

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
    expect(parseVideo("Bohemian Rhapsody", "Queen - Topic")).toMatchObject({ title: "Bohemian Rhapsody", artists: ["Queen"] });
    expect(parseVideo("Queen - Bohemian Rhapsody (Official Video Remastered)", "Queen Official")).toMatchObject({ title: "Bohemian Rhapsody", artists: ["Queen"] });
    expect(parseVideo("Daft Punk – Get Lucky [Lyrics]", "x")).toMatchObject({ title: "Get Lucky", artists: ["Daft Punk"] });
    expect(parseVideo("Shape of You", "Ed Sheeran VEVO")).toMatchObject({ title: "Shape of You", artists: ["Ed Sheeran"] });
    expect(parseVideo('" Kiss Me " - " There She Goes " Version (Official)', "Sixpence None The Richer")).toMatchObject({ title: "Kiss Me", artists: ["Sixpence None The Richer"] });
    expect(parseVideo('"Kiss Me"', "Sixpence None The Richer")).toMatchObject({ title: "Kiss Me", artists: ["Sixpence None The Richer"] });
    expect(parseVideo("Cheap Trick-I Want You To Want Me Lyrics", "x")).toMatchObject({ title: "I Want You To Want Me", artists: ["Cheap Trick"] });
    expect(parseVideo("Sunday Bloody Sunday - U2 (with lyrics)", "jennys YT")).toMatchObject({ title: "U2", artists: ["Sunday Bloody Sunday"] }); // swapped here, fixed by fixUploaderTitles
    expect(parseVideo("U2 moment of surrender lyrics", "x")?.title).toBe("U2 moment of surrender");
    expect(parseVideo("U2 Dirty Day (Taxi Driver Version) - video by U2mixer", "u2mixer")?.title).toBe("U2 Dirty Day (Taxi Driver Version)");
    expect(parseVideo("Stay (tradução) - U2", "Denise Paz")?.title).toBe("U2");
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
    expect(parseVideo('Numb (Official Music Video) [4K UPGRADE] – Linkin Park', 'Linkin Park')).toMatchObject({ title: 'Numb', artists: ['Linkin Park'] });
    expect(parseVideo('In The End [Mellen Gi Remix] feat. Fleurie - Tommee Profitt', 'Tommee Profitt')).toMatchObject({ title: 'In The End [Mellen Gi Remix] feat. Fleurie', artists: ['Tommee Profitt'] });
    expect(parseVideo('Scatman (ski-ba-bop-ba-dop-bop) Official Video HD - Scatman John', 'Scatman John Official YouTube Channel')).toMatchObject({ title: 'Scatman (ski-ba-bop-ba-dop-bop)', artists: ['Scatman John'] });
    expect(parseVideo("8 Letters - Why Don't We [Official Music Video]", "Why Don't We")).toMatchObject({ title: '8 Letters', artists: ["Why Don't We"] });
    expect(parseVideo('The Beatles - The Beatles - Hey Jude (Official Music Video) [Remastered 2015]', 'TheBeatlesVEVO')).toMatchObject({ title: 'Hey Jude', artists: ['The Beatles'] });
    expect(parseVideo('Metallica: Enter Sandman (Official Music Video)', 'Metallica')).toMatchObject({ title: 'Enter Sandman', artists: ['Metallica'] });
    expect(parseVideo('Panic! At The Disco: I Write Sins Not Tragedies [OFFICIAL VIDEO]', 'Fueled By Ramen')).toMatchObject({ title: 'I Write Sins Not Tragedies', artists: ['Panic! At The Disco'] });
    expect(parseVideo('Passenger | Let Her Go (Official Video)', 'Passenger')).toMatchObject({ title: 'Let Her Go', artists: ['Passenger'] });
    expect(parseVideo('Dynasty (Official Music Video) | MIIA', 'MIIA')).toMatchObject({ title: 'Dynasty', artists: ['MIIA'] });
    expect(parseVideo('Limp Bizkit "Behind Blue Eyes"', 'limpbizkit')).toMatchObject({ title: 'Behind Blue Eyes', artists: ['Limp Bizkit'] });
    expect(parseVideo('Neil Diamond "Sweet Caroline" on The Ed Sullivan Show', 'The Ed Sullivan Show')).toMatchObject({ title: 'Sweet Caroline', artists: ['Neil Diamond'] });
    expect(parseVideo('Alok, SOMETHING ELSE– I Wonder If You Know (Official Lyric Video)', 'Alok')).toMatchObject({ title: 'I Wonder If You Know', artists: ['Alok', 'SOMETHING ELSE'] });
    expect(parseVideo('MIRA - Ring, Ring | Official Video', 'MIRA')).toMatchObject({ title: 'Ring, Ring', artists: ['MIRA'] });
    expect(parseVideo('Smiley - Let Me Go | Official Visualiser', 'Smiley')).toMatchObject({ title: 'Let Me Go', artists: ['Smiley'] });
    expect(parseVideo('Calvin Harris ft. Rihanna - This Is What You Came For (Lyrics) HD', 'BestYoutubeVideos')).toMatchObject({ title: 'This Is What You Came For', artists: ['Calvin Harris', 'Rihanna'] });
    expect(parseVideo('Mr. Big - To Be With You 4K Video', 'MrBigVEVO')).toMatchObject({ title: 'To Be With You', artists: ['Mr. Big'] });
    expect(parseVideo('Marshmello & Anne-Marie - FRIENDS (Music Video) *OFFICIAL FRIENDZONE ANTHEM*', 'Marshmello')).toMatchObject({ title: 'FRIENDS', artists: ['Marshmello', 'Anne-Marie'] });
    expect(parseVideo('Lynyrd Skynyrd - Simple Man - Live At The Florida Theatre / 2015', 'LynyrdSkynyrdVEVO')).toMatchObject({ title: 'Simple Man', artists: ['Lynyrd Skynyrd'] });
    expect(parseVideo('Rednex - Cotton Eye Joe (Official Music Video) [HD] - RednexMusic com', 'Rednex Videos')).toMatchObject({ title: 'Cotton Eye Joe', artists: ['Rednex'] });
    expect(parseVideo('BLACK SABBATH - "Paranoid" (Official Video)', 'Black Sabbath')).toMatchObject({ title: 'Paranoid', artists: ['BLACK SABBATH'] });
    expect(parseVideo('Alan Walker - Lily ft. K-391 & Emelie Hollow (Official Lyric Video)', 'K-391')).toMatchObject({ title: 'Lily ft. K-391 & Emelie Hollow', artists: ['Alan Walker'] });
  });

  it("uses artists seen in 3+ tracks to fix uploader titles", () => {
    const mk = (title: string, artists: string[], meta?: { fromChannel?: boolean; rawArtist?: string }) => {
      const x = { id: title, uri: title, title, artists, durationMs: 200_000 };
      if (meta) trackMeta.set(x, meta);
      return x;
    };
    const tracks = [mk("One", ["U2"]), mk("Beautiful Day", ["U2"]), mk("Pride", ["U2"]), mk("Heart", ["Heart"]), mk("Barracuda", ["Heart"]), mk("Alone", ["Heart"]),
      mk("U2 Gloria", ["SolanoEastWood"], { fromChannel: true }),
      mk("U2", ["Sunday Bloody Sunday"], { rawArtist: "Sunday Bloody Sunday" }),
      mk("Wave of sorrow U2", ["rattleU2"], { fromChannel: true }),
      mk("Burning Heart", ["Survivor"], { rawArtist: "Survivor" }), // artist from a real "Artist - Title": left alone
      mk("Heart", ["Somebody"], { rawArtist: "Somebody" })]; // a song called like a known artist, but the parsed artist is not: swapped (accepted trade-off)
    fixUploaderTitles(tracks);
    expect(tracks.slice(6, 10).map((x) => [x.artists[0], x.title])).toEqual([["U2", "Gloria"], ["U2", "Sunday Bloody Sunday"], ["U2", "Wave of sorrow"], ["Survivor", "Burning Heart"]]);
  });

  it("recognises live recordings but not songs with 'live' in the name", () => {
    for (const live of ["Paramore - Misery Business w/fan (Live) - Front Row - Wellington, NZ 7/10/10 HD", "U2 - Miracle Drug (Live)", "Aerosmith - Dream On (Live At Capitol Center, Largo, MD / November 9, 1978)", "Queen - Bootleg 1981 Montreal", "Band - Rehearsal footage", "The Beatles - Twist And Shout (Performed Live On The Ed Sullivan Show 2/23/64)"]) expect(isLiveRecording(live), live).toBe(true);
    for (const studio of ["Tears in Heaven (Acoustic) (Live at MTV Unplugged, Bray Film Studios)", "Nirvana - The Man Who Sold The World (MTV Unplugged)", "Oasis - Live Forever (Remastered)", "Wings - Live and Let Die", "Bon Jovi - Livin' on a Prayer", "Queen - Bohemian Rhapsody (Official Video Remastered)", "Alive - Pearl Jam"]) expect(isLiveRecording(studio), studio).toBe(false);
  });

  it("does not trust tracks whose artist is only the uploader or whose title keeps video leftovers", () => {
    const mk = (title: string, artists: string[], meta?: { fromChannel?: boolean; official?: boolean }) => {
      const x = { id: title, uri: title, title, artists, durationMs: 200_000 };
      if (meta) trackMeta.set(x, meta);
      return x;
    };
    const none = () => 0;
    expect(doubt(mk("Gloria", ["SolanoEastWood"], { fromChannel: true }), none)).toBeTruthy();
    expect(doubt(mk("Hold Me", ["U2"], { fromChannel: true, official: true }), none)).toBeUndefined();
    expect(doubt(mk("Start Me Up - Official Promo", ["The Rolling Stones"]), none)).toBeTruthy();
    expect(doubt(mk("Kiss Me", ["Sixpence None The Richer"]), none)).toBeUndefined();
    expect(doubt(mk("Video Killed the Radio Star", ["The Buggles"]), none)).toBeUndefined();
  });
});
