import type { PlayerCommand } from "@tuneguesser/shared";
import type { MusicProvider, Track } from "./music";

/** Accepts a playlist URL or a bare playlist id. */
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{10,64}$/.test(s) && /^(PL|UU|LL|OL|RD|FL)/.test(s)) return s;
  try {
    const u = new URL(s);
    if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)) return null;
    const id = u.searchParams.get("list");
    return id && /^[\w-]{10,64}$/.test(id) ? id : null;
  } catch { return null; }
}

/** ISO-8601 duration ("PT3M25S") to milliseconds. */
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [d, h, mi, s] = [1, 2, 3, 4].map((i) => Number(m[i] ?? 0));
  return (((d! * 24 + h!) * 60 + mi!) * 60 + s!) * 1000;
}

const NOISE = /\s*[\(\[][^)\]]*\b(official|lyrics?|lyric video|audio|video|music video|hd|hq|4k|remaster(ed)?|visuali[sz]er|live)\b[^)\]]*[\)\]]/gi;

/**
 * Turns a YouTube video into a title and artist(s).
 * Auto-generated "Artist - Topic" channels carry the clean title; otherwise "Artist - Title" is split from the video title.
 */
export function parseVideo(videoTitle: string, channel: string): { title: string; artists: string[] } | null {
  const clean = (t: string) => t.replace(NOISE, "").replace(/\s{2,}/g, " ").trim();
  const topic = /^(.*) - Topic$/.exec(channel.trim());
  if (topic) return { title: clean(videoTitle), artists: topic[1]!.split(/\s*,\s*|\s*&\s*/).filter(Boolean) };
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(clean(videoTitle));
  if (m) return { title: m[2]!.trim(), artists: m[1]!.split(/\s*,\s*|\s*&\s*|\s+x\s+|\s+feat\.?\s+|\s+ft\.?\s+/i).filter(Boolean) };
  const c = channel.replace(/\s*VEVO$/i, "").trim();
  return c ? { title: clean(videoTitle), artists: [c] } : null;
}

export interface YouTubePlaylist { id: string; name: string; tracks: number; image?: string }

/** Minimal YouTube Data API v3 client (API key only: public and unlisted playlists, no login). */
export class YouTubeApi {
  constructor(private key: string, private fetcher: typeof fetch = fetch) {}

  private async get(path: string, params: Record<string, string>): Promise<any> {
    const res = await this.fetcher(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: this.key })}`);
    if (!res.ok) throw new Error(`YouTube ${path} ${res.status}`);
    return res.json();
  }

  async playlist(id: string): Promise<YouTubePlaylist | null> {
    const j = await this.get("playlists", { part: "snippet,contentDetails", id });
    const p = j.items?.[0];
    return p ? { id, name: p.snippet.title, tracks: p.contentDetails?.itemCount ?? 0, image: p.snippet.thumbnails?.medium?.url } : null;
  }

  /** Embeddable videos of a playlist (up to 300), with duration. */
  async tracks(playlistId: string): Promise<Track[]> {
    const ids: string[] = [];
    let page = "";
    for (let i = 0; i < 6; i++) {
      const j = await this.get("playlistItems", { part: "contentDetails", playlistId, maxResults: "50", ...(page ? { pageToken: page } : {}) });
      for (const it of j.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
      if (!(page = j.nextPageToken)) break;
    }
    const out: Track[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const j = await this.get("videos", { part: "snippet,contentDetails,status", id: ids.slice(i, i + 50).join(",") });
      for (const v of j.items ?? []) {
        if (v.status?.embeddable === false || v.snippet?.liveBroadcastContent !== "none") continue;
        const meta = parseVideo(v.snippet.title, v.snippet.channelTitle ?? "");
        const durationMs = parseDuration(v.contentDetails?.duration ?? "");
        if (!meta || durationMs < 45_000 || durationMs > 15 * 60_000) continue; // clips and mixes make poor rounds
        out.push({
          id: v.id, uri: v.id, title: meta.title, artists: meta.artists, durationMs,
          albumArt: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url,
          year: v.snippet.publishedAt?.slice(0, 4),
        });
      }
    }
    return out;
  }
}

/** Plays through the embedded YouTube player on the host screen: the server only sends it commands. */
export class YouTubeProvider implements MusicProvider {
  /** set by the server: delivers a command to the host screen(s) */
  emit: (c: PlayerCommand) => void = () => {};
  constructor(private api: YouTubeApi, private playlistIds: string[]) {}

  async loadTracks(): Promise<Track[]> {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const id of this.playlistIds) for (const t of await this.api.tracks(id)) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    return out;
  }
  async play(track: Track, startMs: number) { this.emit({ op: "play", videoId: track.uri, startMs }); }
  async pause() { this.emit({ op: "pause" }); }
  async resume(track: Track, positionMs: number) { this.emit({ op: "resume", videoId: track.uri, positionMs }); }
}
