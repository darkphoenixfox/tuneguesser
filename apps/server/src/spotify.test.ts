import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotifyClient, SpotifyProvider } from "./spotify";

const tokens = { accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3600_000 };
const track = { id: "1", uri: "spotify:track:1", title: "x", artists: ["y"], durationMs: 200_000 };

function mockFetch(body: string, status = 200) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), method: String(init.method), body: init.body as string | undefined });
    return new Response(body, { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Spotify playback commands", () => {
  it("treats a plain-text 200 body as success (no JSON error)", async () => {
    mockFetch("DY9zc8HpAE");
    const c = new SpotifyClient("id", tokens);
    await expect(c.api("PUT", "/me/player/pause")).resolves.toBeNull();
  });

  it("resume uses Spotify's own resume (no body, no seek) and does not restart the track", async () => {
    const calls = mockFetch("DY9zc8HpAE");
    const p = new SpotifyProvider(new SpotifyClient("id", tokens), "pl", "dev1");
    await p.resume(track, 50_000);
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ method: "PUT" });
    expect(calls[0]!.url).toContain("/me/player/play?device_id=dev1");
    expect(calls[0]!.body).toBeUndefined(); // no uris / position_ms: continues where it paused
  });

  it("falls back to playing at the saved position only if Spotify refuses to resume", async () => {
    const calls: Array<{ body?: string }> = [];
    let n = 0;
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      calls.push({ body: init.body as string | undefined });
      return n++ === 0 ? new Response("no active device", { status: 404 }) : new Response(null, { status: 204 });
    });
    const p = new SpotifyProvider(new SpotifyClient("id", tokens), "pl");
    await p.resume(track, 50_000);
    expect(calls.length).toBe(2);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ uris: ["spotify:track:1"], position_ms: 50_000 });
  });
});
