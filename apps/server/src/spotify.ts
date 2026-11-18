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
  constructor(private clientId: string, private tokens: Tokens) {}

  private async token(): Promise<string> {
    if (Date.now() > this.tokens.expiresAt - 30_000) {
      const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: this.tokens.refreshToken, client_id: this.clientId });
      this.tokens = {
        accessToken: j.access_token,
        refreshToken: j.refresh_token ?? this.tokens.refreshToken,
        expiresAt: Date.now() + j.expires_in * 1000,
      };
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
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async playlists(): Promise<Array<{ id: string; name: string; tracks: number; image?: string }>> {
    const j = await this.api("GET", "/me/playlists?limit=50");
    return (j?.items ?? []).filter(Boolean).map((p: any) => ({
      id: p.id, name: p.name, tracks: p.tracks?.total ?? 0, image: p.images?.[0]?.url,
    }));
  }

  async devices(): Promise<Array<{ id: string; name: string; type: string; active: boolean }>> {
    const j = await this.api("GET", "/me/player/devices");
    return (j?.devices ?? []).map((d: any) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active }));
  }
}

/** Plays a Spotify playlist on one of the host's devices. */
export class SpotifyProvider implements MusicProvider {
  constructor(private client: SpotifyClient, private playlistId: string, private deviceId?: string) {}

  async loadTracks(): Promise<Track[]> {
    const out: Track[] = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const j = await this.client.api("GET", `/playlists/${this.playlistId}/tracks?limit=100&offset=${offset}&fields=items(track(id,uri,name,duration_ms,is_local,type,artists(name),album(release_date,images))),next`);
      for (const it of j?.items ?? []) {
        const t = it?.track;
        if (!t || t.is_local || t.type !== "track" || !t.id) continue;
        out.push({
          id: t.id, uri: t.uri, title: t.name, artists: t.artists.map((a: any) => a.name),
          durationMs: t.duration_ms, albumArt: t.album?.images?.[0]?.url, year: t.album?.release_date?.slice(0, 4),
        });
      }
      if (!j?.next) break;
    }
    return out;
  }

  private dev() { return this.deviceId ? `?device_id=${encodeURIComponent(this.deviceId)}` : ""; }

  async play(track: Track, startMs: number) {
    await this.client.api("PUT", `/me/player/play${this.dev()}`, { uris: [track.uri], position_ms: startMs });
  }

  async pause() {
    await this.client.api("PUT", `/me/player/pause${this.dev()}`);
  }
}
