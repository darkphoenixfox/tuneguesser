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

const NOISE = /\s*[\(\[][^)\]]*\b(official|lyrics?|lyric video|audio|video|music video|hd|hq|4k|remaster(ed)?|visuali[sz]er|live|tradu[cç][aã]o|traducci[oó]n|subtitulad[ao]|letra)\b[^)\]]*[\)\]]/gi;

/** Trailing leftovers of the video title: "| Official Visualizer", "Official Video HD", "HD", "4K Video", "*OFFICIAL ANTHEM*", "Out Now!" */
const TAIL = /\s*(?:[|*]\s*)?(?:(?:official\s+(?:(?:music|lyrics?)\s+)?|(?:music|lyrics?)\s+)(?:video|audio|visuali[sz]er)|video\s+official)(?:\s+(?:hd|hq|4k))?\s*\**\s*$|\s+(?:hd|hq|4k(?:\s+video)?)\s*$|\s+(?:with\s+)?lyrics?$|\s+-\s+(?:with lyrics|video by .*)$|\s+(?:nw\s+)?out now!?$|\s*\*[^*]*official[^*]*\*\s*$/i;
/** Extra " - ..." parts that are not part of the song name */
const JUNK_PART = /^(live\b|(explicit|clean|single|album|studio|radio)\b.*\bver|remaster|mono\b|stereo\b|.*\b(com|www)$)/i;
const SEP = /\s+[-–—|]\s+|\s*[–—]\s+/;
const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const unquote = (x: string) => x.replace(/^["“”‘’']\s*([^"“”‘’]+?)\s*["“”‘’']$/, "$1").trim();

function tidy(x: string): string {
  let t = x.replace(/\.(flv|mp4|avi|mov|mpg|wmv|m4v)$/i, "").replace(NOISE, "").replace(/\s{2,}/g, " ").trim();
  for (let prev = ""; prev !== t;) { prev = t; t = t.replace(TAIL, "").trim(); }
  return t;
}

/**
 * Turns a YouTube video into a title and artist(s).
 * Auto-generated "Artist - Topic" channels carry the clean title; otherwise the video title is split:
 * "Artist - Title", "Title - Artist" (when the channel is the second part), "Artist | Title", "Artist: Title",
 * 'Artist "Title"', '"Title" - ...' (channel = artist). "(Official Video)", "| Visualizer", "HD" and similar are removed.
 */
export function parseVideo(videoTitle: string, channel: string): { title: string; artists: string[]; loose?: boolean; fromChannel?: boolean; rawArtist?: string } | null {
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
      if (isChannel(b) && !isChannel(a)) return { title: unquote(a), artists: split(b), rawArtist: b }; // "Title - Artist"
      return { title: unquote(title), artists: split(a), rawArtist: a };
    }
  }
  return channelName ? { title: unquote(segs[0] ?? cleaned), artists: [channelName], fromChannel: true } : null;
}

/** Tracks whose artist/title order was only guessed (unspaced hyphen: "somebody to love-jefferson airplane"). */
export const loose = new WeakSet<Track>();
/** How a track was parsed: `fromChannel` = no "Artist - Title" in the video title (the uploader is the artist); `rawArtist` = the unsplit artist text. */
export const trackMeta = new WeakMap<Track, { fromChannel?: boolean; rawArtist?: string; official?: boolean }>();

/**
 * The order of a "x-y" title is ambiguous. Artists seen in confident titles (same playlists) settle it:
 * if only the second part is a known artist, swap.
 */
export function fixLoose(tracks: Track[]): Track[] {
  const key = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const known = new Set<string>();
  for (const t of tracks) if (!loose.has(t)) for (const a of t.artists) known.add(key(a));
  fixUploaderTitles(tracks);
  for (const t of tracks) {
    if (!loose.has(t) || t.artists.length !== 1) continue;
    const [a, ti] = [key(t.artists[0]!), key(t.title)];
    if (known.has(ti) && !known.has(a)) { const old = t.title; t.title = t.artists[0]!; t.artists = [old]; }
  }
  return tracks;
}

/**
 * Uploads without a clear "Artist - Title" ("U2 Gloria" by a fan channel, "Sunday Bloody Sunday - U2") get the uploader as artist or
 * the two parts swapped. An artist that appears in 3+ tracks is "known": when the parsed artist is not known and the title starts or
 * ends with a known artist (or is exactly one), that is the artist.
 */
export function fixUploaderTitles(tracks: Track[]): void {
  const key = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const count = new Map<string, { n: number; name: string }>();
  for (const t of tracks) for (const a of t.artists) { const k = key(a); if (k.length < 2) continue; const c = count.get(k) ?? { n: 0, name: a }; c.n++; count.set(k, c); }
  const knownNames = [...count.values()].filter((c) => c.n >= 3).map((c) => c.name).sort((a, b) => b.length - a.length);
  const isKnown = (x: string) => (count.get(key(x))?.n ?? 0) >= 3;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const t of tracks) {
    if (t.artists.some(isKnown)) continue;
    const m = trackMeta.get(t);
    for (const k of knownNames) {
      // "Sunday Bloody Sunday - U2": parts swapped
      if (m?.rawArtist && key(t.title) === key(k)) { t.title = m.rawArtist; t.artists = [k]; break; }
      if (!m?.fromChannel) continue;
      // "U2 Gloria" / "Heartland U2" by a fan channel: the known artist is at the start or the end of the title
      const pre = new RegExp(`^${esc(k)}\\s*[-–:]?\\s+(.{2,})$`, "i").exec(t.title);
      const suf = new RegExp(`^(.{2,}?)\\s*[-–:]?\\s+${esc(k)}$`, "i").exec(t.title);
      const rest = pre?.[1] ?? suf?.[1];
      if (rest) { t.artists = [k]; t.title = rest.trim(); break; }
    }
  }
}

/** Live recordings (concerts, fan videos, unplugged sessions): the sound and length do not match the studio song. */
export function isLiveRecording(title: string): boolean {
  if (/unplugged/i.test(title)) return false; // unplugged versions are kept, even when they are filmed live
  return /\(\s*live\b|\[\s*live\b|[-–—|]\s*live(?:\s*$|\s*[(\[\-–—|,/@]|\s+(?:at|from|in|on|version|performance|session|concert|recording|\d))|\blive\s+(at|from|in|on|@|version|performance|session|concert|tour|recording|aid|8|20\d\d|19\d\d)\b|\blive$|in concert|full concert|\bconcert\b|fan[- ]?cam|bootleg|audience (?:recording|video|footage)|soundboard|\bgig\b|backstage|rehearsal|sound ?check|interview|behind the scenes|front row|\bw\/\s*fan|\bfestival\b|world tour|\btour\b|\ben vivo\b|\ben directo\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i.test(title);
}

/**
 * Why a track is not trusted (undefined = fine). Doubtful tracks are not played at all, like a song voted down:
 * the artist is only the uploader's channel, the order of an "x-y" title is a guess, or leftovers of the video title remain.
 */
export function doubt(t: Track, artistCount: (name: string) => number): string | undefined {
  const m = trackMeta.get(t);
  const artist = t.artists[0] ?? "";
  if (m?.fromChannel && !m.official && artistCount(artist) < 3) return "artist is only the uploader's channel";
  if (loose.has(t) && artistCount(artist) < 3 && artistCount(t.title) < 3) return "artist/title order of an unspaced hyphen is a guess";
  const outsideBrackets = t.title.replace(/\s*[(\[][^)\]]*[)\]]/g, "");
  if (/\b(official|lyrics?|visuali[sz]er)\b|\b(hd|4k)\b|["“”]/i.test(outsideBrackets)) return "video-title leftovers in the title";
  if (t.title.length > 80 || t.artists.some((a) => a.length > 50)) return "implausibly long title or artist";
  return undefined;
}

export function dropDoubtful(tracks: Track[]): Track[] {
  const key = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const count = new Map<string, number>();
  for (const t of tracks) for (const a of t.artists) count.set(key(a), (count.get(key(a)) ?? 0) + 1);
  const n = (name: string) => count.get(key(name)) ?? 0;
  return tracks.filter((t) => !doubt(t, n));
}

/** Hand-corrected songs (video id -> title/artists) for uploads whose title cannot be parsed reliably. */
const OVERRIDES: Record<string, { title: string; artists: string[] }> = {
  JUbMWtUyIIE: { title: "Somebody to Love", artists: ["Jefferson Airplane"] }, // uploaded as "somebody to love-jefferson airplane"
};

/**
 * Auto-generated "Artist - Topic" videos are named after the first artist only, but their description lists everyone:
 * "Provided to YouTube by Columbia\n\nSTAY · The Kid LAROI · Justin Bieber". Returns that list (or null).
 */
export function topicArtists(description: string, channel: string): string[] | null {
  if (!/ - Topic$/.test(channel.trim())) return null;
  const m = /Provided to YouTube by[^\n]*\n+([^\n]+)/.exec(description ?? "");
  const parts = m?.[1]!.split(/\s+·\s+/).map((x) => x.trim()).filter(Boolean) ?? [];
  const artists = parts.slice(1);
  return artists.length > 1 ? artists : null;
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
        if (isLiveRecording(v.snippet.title)) continue; // concert footage and fan recordings make poor rounds
        const parsed = OVERRIDES[v.id] ?? parseVideo(v.snippet.title, v.snippet.channelTitle ?? "");
        const all = topicArtists(v.snippet.description ?? "", v.snippet.channelTitle ?? ""); // everyone credited, not only the channel's artist
        const meta = parsed && all ? { ...parsed, artists: all } : parsed;
        const durationMs = parseDuration(v.contentDetails?.duration ?? "");
        if (!meta || durationMs < 45_000 || durationMs > 15 * 60_000) continue; // clips and mixes make poor rounds
        const track: Track = {
          id: v.id, uri: v.id, title: meta.title, artists: meta.artists, durationMs,
          albumArt: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.medium?.url,
          year: v.snippet.publishedAt?.slice(0, 4),
        };
        if ("loose" in meta && meta.loose) loose.add(track);
        if ("fromChannel" in meta || "rawArtist" in meta) trackMeta.set(track, { fromChannel: (meta as { fromChannel?: boolean }).fromChannel, rawArtist: (meta as { rawArtist?: string }).rawArtist, official: /VEVO$|Official|- Topic$/i.test(v.snippet.channelTitle ?? "") });
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
  /** set by the server: applies the playlist's corrections (fixed titles, "one artist only") to the songs of one playlist */
  adjust?: (playlistId: string, tracks: Track[]) => Track[];
  constructor(private api: YouTubeApi, private playlistIds: string[]) {}

  /** The command that makes a new listener play the current song from where it is, or null when nothing is playing. */
  snapshot(): PlayerCommand | null {
    const n = this.now;
    return n?.playing ? { op: "play", videoId: n.videoId, startMs: n.pos + (Date.now() - n.at) } : null;
  }

  async loadTracks(): Promise<Track[]> {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const id of this.playlistIds) {
      const list = dropDoubtful(fixLoose(await this.api.tracks(id))); // judged per playlist, the same as on the playlist page
      for (const t of this.adjust ? this.adjust(id, list) : list) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); }
    }
    return out;
  }
  async play(track: Track, startMs: number) { this.now = { videoId: track.uri, pos: startMs, at: Date.now(), playing: true }; this.emit({ op: "play", videoId: track.uri, startMs }); }
  async pause() { if (this.now?.playing) this.now = { ...this.now, pos: this.now.pos + (Date.now() - this.now.at), playing: false }; this.emit({ op: "pause" }); }
  async resume(track: Track, positionMs: number) { this.now = { videoId: track.uri, pos: this.now?.videoId === track.uri && !this.now.playing ? this.now.pos : positionMs, at: Date.now(), playing: true }; this.emit({ op: "resume", videoId: track.uri, positionMs }); }
}
