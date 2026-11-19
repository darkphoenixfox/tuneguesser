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

/** Trailing leftovers of the video title: "| Official Visualizer", "Official Video HD", "HD", "4K Video", "*OFFICIAL ANTHEM*", "Out Now!" */
const TAIL = /\s*(?:[|*]\s*)?(?:(?:official\s+(?:(?:music|lyrics?)\s+)?|(?:music|lyrics?)\s+)(?:video|audio|visuali[sz]er)|video\s+official)(?:\s+(?:hd|hq|4k))?\s*\**\s*$|\s+(?:hd|hq|4k(?:\s+video)?)\s*$|\s+lyrics?$|\s+(?:nw\s+)?out now!?$|\s*\*[^*]*official[^*]*\*\s*$/i;
/** Extra " - ..." parts that are not part of the song name */
const JUNK_PART = /^(live\b|(explicit|clean|single|album|studio|radio)\b.*\bver|remaster|mono\b|stereo\b|.*\b(com|www)$)/i;
const SEP = /\s+[-–—|]\s+|\s*[–—]\s+/;
const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const unquote = (x: string) => x.replace(/^["“”‘’']\s*([^"“”‘’]+?)\s*["“”‘’']$/, "$1").trim();

function tidy(x: string): string {
  let t = x.replace(NOISE, "").replace(/\s{2,}/g, " ").trim();
  for (let prev = ""; prev !== t;) { prev = t; t = t.replace(TAIL, "").trim(); }
  return t;
}

/**
 * Turns a YouTube video into a title and artist(s).
 * Auto-generated "Artist - Topic" channels carry the clean title; otherwise the video title is split:
 * "Artist - Title", "Title - Artist" (when the channel is the second part), "Artist | Title", "Artist: Title",
 * 'Artist "Title"', '"Title" - ...' (channel = artist). "(Official Video)", "| Visualizer", "HD" and similar are removed.
 */
export function parseVideo(videoTitle: string, channel: string): { title: string; artists: string[]; loose?: boolean } | null {
  const topic = /^(.*) - Topic$/.exec(channel.trim());
  const split = (a: string) => a.split(/\s*,\s*|\s*&\s*|\s+x\s+|\s+feat\.?\s+|\s+ft\.?\s+/i).map((x) => x.trim()).filter(Boolean);
  if (topic) return { title: tidy(videoTitle).replace(/\s+-\s+(explicit|clean)\s+ver(\.|sion)?$/i, ""), artists: topic[1]!.split(/\s*,\s*|\s*&\s*/).filter(Boolean) };
  const channelName = channel.replace(/\s*(VEVO|Official( YouTube Channel)?|HQ)$/i, "").trim();
  const chn = norm(channelName);
  const cleaned = tidy(videoTitle);
  // '"Kiss Me" - "There She Goes" Version': a quoted first part is the song, the channel is the artist
  const quoted = /^["“”‘’']\s*(.+?)\s*["“”‘’']\s+[-–—]\s+/.exec(cleaned) ?? /^["“”]\s*(.+?)\s*["“”]$/.exec(cleaned);
  if (quoted && channelName) return { title: quoted[1]!.trim(), artists: [channelName] };

  let segs = cleaned.split(SEP).map((x) => tidy(x)).filter(Boolean);
  if (segs.length === 1) {
    const colon = /^(.{1,40}?):\s+(.+)$/.exec(cleaned);
    const quotedTitle = /^(.+?)\s+["“](.+?)["”](?:\s+.*)?$/.exec(cleaned); // Limp Bizkit "Behind Blue Eyes"
    // "Artist-Title" / "title-artist" with a hyphen and no spaces: the order is a guess (see fixLoose)
    const tight = cleaned.match(/\S-\S/g)?.length === 1 ? /^(.{3,}?)-(.{3,})$/.exec(cleaned) : null;
    if (colon) segs = [colon[1]!, colon[2]!];
    else if (quotedTitle) segs = [quotedTitle[1]!, quotedTitle[2]!];
    else if (tight && cleaned.split(/\s+/).length >= 3) { const r = parseVideo(`${tight[1]!.trim()} - ${tight[2]!.trim()}`, channel); return r && { ...r, loose: true }; }
  }
  if (segs.length >= 2) {
    if (norm(segs[0]!) === norm(segs[1]!)) segs.shift(); // "The Beatles - The Beatles - Hey Jude"
    if (segs.length >= 2) {
      const [a, b, ...rest] = segs as [string, string, ...string[]];
      const title = [b, ...rest.filter((x) => !JUNK_PART.test(x))].join(" - ");
      const isChannel = (x: string) => !!chn && (norm(x) === chn || (norm(x).length > 3 && chn.includes(norm(x))));
      if (isChannel(b) && !isChannel(a)) return { title: unquote(a), artists: split(b) }; // "Title - Artist"
      return { title: unquote(title), artists: split(a) };
    }
  }
  return channelName ? { title: unquote(segs[0] ?? cleaned), artists: [channelName] } : null;
}

/** Tracks whose artist/title order was only guessed (unspaced hyphen: "somebody to love-jefferson airplane"). */
export const loose = new WeakSet<Track>();

/**
 * The order of a "x-y" title is ambiguous. Artists seen in confident titles (same playlists) settle it:
 * if only the second part is a known artist, swap.
 */
export function fixLoose(tracks: Track[]): Track[] {
  const key = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const known = new Set<string>();
  for (const t of tracks) if (!loose.has(t)) for (const a of t.artists) known.add(key(a));
  for (const t of tracks) {
    if (!loose.has(t) || t.artists.length !== 1) continue;
    const [a, ti] = [key(t.artists[0]!), key(t.title)];
    if (known.has(ti) && !known.has(a)) { const old = t.title; t.title = t.artists[0]!; t.artists = [old]; }
  }
  return tracks;
}

/** Hand-corrected songs (video id -> title/artists) for uploads whose title cannot be parsed reliably. */
const OVERRIDES: Record<string, { title: string; artists: string[] }> = {
  JUbMWtUyIIE: { title: "Somebody to Love", artists: ["Jefferson Airplane"] }, // uploaded as "somebody to love-jefferson airplane"
};

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
        const meta = OVERRIDES[v.id] ?? parseVideo(v.snippet.title, v.snippet.channelTitle ?? "");
        const durationMs = parseDuration(v.contentDetails?.duration ?? "");
        if (!meta || durationMs < 45_000 || durationMs > 15 * 60_000) continue; // clips and mixes make poor rounds
        const track: Track = {
          id: v.id, uri: v.id, title: meta.title, artists: meta.artists, durationMs,
          albumArt: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url,
          year: v.snippet.publishedAt?.slice(0, 4),
        };
        if ("loose" in meta && meta.loose) loose.add(track);
        out.push(track);
      }
    }
    return out;
  }
}

/** Plays through the embedded YouTube player on the host screen: the server only sends it commands. */
export class YouTubeProvider implements MusicProvider {
  /** set by the server: delivers a command to the host screen(s) */
  emit: (c: PlayerCommand) => void = () => {};
  /** what is playing, so a device that starts listening mid-song can join in at the right place */
  private now: { videoId: string; pos: number; at: number; playing: boolean } | null = null;
  constructor(private api: YouTubeApi, private playlistIds: string[]) {}

  /** The command that makes a new listener play the current song from where it is, or null when nothing is playing. */
  snapshot(): PlayerCommand | null {
    const n = this.now;
    return n?.playing ? { op: "play", videoId: n.videoId, startMs: n.pos + (Date.now() - n.at) } : null;
  }

  async loadTracks(): Promise<Track[]> {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const id of this.playlistIds) for (const t of await this.api.tracks(id)) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    return fixLoose(out);
  }
  async play(track: Track, startMs: number) { this.now = { videoId: track.uri, pos: startMs, at: Date.now(), playing: true }; this.emit({ op: "play", videoId: track.uri, startMs }); }
  async pause() { if (this.now?.playing) this.now = { ...this.now, pos: this.now.pos + (Date.now() - this.now.at), playing: false }; this.emit({ op: "pause" }); }
  async resume(track: Track, positionMs: number) { this.now = { videoId: track.uri, pos: this.now?.videoId === track.uri && !this.now.playing ? this.now.pos : positionMs, at: Date.now(), playing: true }; this.emit({ op: "resume", videoId: track.uri, positionMs }); }
}
