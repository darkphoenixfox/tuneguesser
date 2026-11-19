import { createHash, randomBytes } from "node:crypto";
import type { MusicProvider, Track } from "./music";

const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const b64url = (b: Buffer) => b.toString("base64url");

export function newPkce() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(randomBytes(16)) };
}

export function authorizeUrl(clientId: string, redirectUri: string, challenge: string, state: string) {
  const q = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri,
    scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge, state,
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<any> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Spotify token error ${res.status}`);
  return res.json();
}

export async function exchangeCode(clientId: string, redirectUri: string, code: string, verifier: string): Promise<Tokens> {
  const j = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier });
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
}

export class SpotifyClient {
  constructor(private clientId: string, private tokens: Tokens, private onTokens?: (t: Tokens) => void) {}
  get current(): Tokens { return this.tokens; }

  private async token(): Promise<string> {
    if (Date.now() > this.tokens.expiresAt - 30_000) {
      const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: this.tokens.refreshToken, client_id: this.clientId });
      this.tokens = {
        accessToken: j.access_token,
        refreshToken: j.refresh_token ?? this.tokens.refreshToken,
        expiresAt: Date.now() + j.expires_in * 1000,
      };
      this.onTokens?.(this.tokens);
    }
    return this.tokens.accessToken;
  }

  async api<T = any>(method: string, path: string, body?: unknown): Promise<T | null> {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    }
    // Success. Playback commands (play/pause) may answer with an empty or plain-text body, not JSON: that is still success.
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Playlists whose items this app may read. Since Feb 2026 Spotify only returns playlist items
   * for playlists the user owns or collaborates on, so anything else is left out.
   */
  async playlists(): Promise<Array<{ id: string; name: string; tracks: number; image?: string }>> {
    const me = await this.api("GET", "/me");
    const j = await this.api("GET", "/me/playlists?limit=50");
    return (j?.items ?? [])
      .filter((p: any) => p && (p.owner?.id === me?.id || p.collaborative))
      .map((p: any) => ({
        id: p.id, name: p.name, tracks: p.items?.total ?? p.tracks?.total ?? 0, image: p.images?.[0]?.url,
      }));
  }

  async devices(): Promise<Array<{ id: string; name: string; type: string; active: boolean }>> {
    const j = await this.api("GET", "/me/player/devices");
    return (j?.devices ?? []).map((d: any) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active }));
  }
}

/** Plays a Spotify playlist on one of the host's devices. */
export class SpotifyProvider implements MusicProvider {
  constructor(private client: SpotifyClient, private playlistIds: string[], private deviceId?: string) {}

  async loadTracks(): Promise<Track[]> {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const playlistId of this.playlistIds) {
      for (let offset = 0; offset < 500; offset += 100) {
        const j = await this.client.api("GET", `/playlists/${playlistId}/items?limit=100&offset=${offset}`);
        for (const it of j?.items ?? []) {
          const t = it?.item ?? it?.track; // 'item' since the Feb 2026 API change
          if (!t || t.is_local || t.type !== "track" || !t.id || seen.has(t.id)) continue; // skips episodes, local files, duplicates
          seen.add(t.id);
          out.push({
            id: t.id, uri: t.uri, title: t.name, artists: t.artists.map((a: any) => a.name),
            durationMs: t.duration_ms, albumArt: t.album?.images?.[0]?.url, year: t.album?.release_date?.slice(0, 4),
          });
        }
        if (!j?.next) break;
      }
    }
    return out;
  }

  /** Transfers the running playback to another device (the song continues where it is). */
  async setDevice(deviceId: string, keepPlaying: boolean) {
    this.deviceId = deviceId;
    await this.client.api("PUT", "/me/player", { device_ids: [deviceId], play: keepPlaying });
  }

  private dev() { return this.deviceId ? `?device_id=${encodeURIComponent(this.deviceId)}` : ""; }

  async play(track: Track, startMs: number) {
    await this.client.api("PUT", `/me/player/play${this.dev()}`, { uris: [track.uri], position_ms: startMs });
  }

  async pause() {
    await this.client.api("PUT", `/me/player/pause${this.dev()}`);
  }

  /** Spotify's own resume (no body) continues from the paused position, with no seeking. */
  async resume(track: Track, positionMs: number) {
    try {
      await this.client.api("PUT", `/me/player/play${this.dev()}`);
    } catch {
      // nothing to resume (e.g. the player went idle): start the track again at the saved position
      await this.play(track, positionMs);
    }
  }
}
