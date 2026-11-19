import fs from "node:fs";
import path from "node:path";
import type { Track } from "./music";

export interface TrackEdit { title?: string; artists?: string[] }
export interface PlaylistSettings { /** every song is treated as by this artist */ artist?: string; /** the name shown instead of the YouTube title */ name?: string }
interface Data { tracks: Record<string, TrackEdit>; playlists: Record<string, PlaylistSettings>; removed: string[] }

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Corrections made on the playlist pages: fixed titles/artists per video, and "one artist only" per playlist.
 * Kept in DATA_DIR/edits.json (shared by both blue/green servers: re-read before every use). Like the thumbs-down list, it applies to everyone.
 */
export class EditStore {
  constructor(private file: string) {}

  private read(): Data {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      return { tracks: d?.tracks ?? {}, playlists: d?.playlists ?? {}, removed: Array.isArray(d?.removed) ? d.removed : [] };
    } catch { return { tracks: {}, playlists: {}, removed: [] }; }
  }
  private write(d: Data) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(d));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.warn("could not save edits:", (e as Error).message); }
  }

  /** `null` removes the correction. */
  editTrack(id: string, edit: { title?: string; artists?: string[] } | null) {
    if (!/^[\w-]{6,20}$/.test(id)) return;
    const d = this.read();
    const title = clean(edit?.title, 120);
    const artists = (Array.isArray(edit?.artists) ? edit!.artists : []).map((a) => clean(a, 80)).filter(Boolean).slice(0, 6);
    if (!edit || (!title && !artists.length)) delete d.tracks[id];
    else d.tracks[id] = { ...(title ? { title } : {}), ...(artists.length ? { artists } : {}) };
    this.write(d);
  }

  setArtist(playlistId: string, artist: string | null) {
    if (!/^[\w-]{6,64}$/.test(playlistId)) return;
    const d = this.read();
    this.patch(d, playlistId, { artist: clean(artist, 80) || undefined });
    this.write(d);
  }

  setName(playlistId: string, name: string | null) {
    if (!/^[\w-]{6,64}$/.test(playlistId)) return;
    const d = this.read();
    this.patch(d, playlistId, { name: clean(name, 80) || undefined });
    this.write(d);
  }

  private patch(d: Data, id: string, change: PlaylistSettings) {
    const next = { ...d.playlists[id], ...change };
    if (!next.artist) delete next.artist;
    if (!next.name) delete next.name;
    if (Object.keys(next).length) d.playlists[id] = next; else delete d.playlists[id];
  }

  names(): Record<string, string> {
    return Object.fromEntries(Object.entries(this.read().playlists).filter(([, p]) => p.name).map(([id, p]) => [id, p.name!]));
  }

  /** Playlists taken off the list for everyone. */
  removed(): string[] { return this.read().removed; }
  setRemoved(id: string, gone: boolean) {
    if (!/^[\w-]{6,64}$/.test(id)) return;
    const d = this.read();
    d.removed = d.removed.filter((x) => x !== id);
    if (gone) d.removed.push(id);
    this.write(d);
  }

  playlist(id: string): PlaylistSettings { return this.read().playlists[id] ?? {}; }
  edits(): Record<string, TrackEdit> { return this.read().tracks; }

  /** Applies the corrections to one playlist's songs (the "one artist" filter is separate: see `onlyArtist`). */
  apply(tracks: Track[], edits = this.edits()): Track[] {
    return tracks.map((t) => { const e = edits[t.id]; return e ? { ...t, title: e.title ?? t.title, artists: e.artists ?? t.artists } : t; });
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "One artist only": every song of the playlist is by `artist`, whatever the video title looked like.
 * The artist's name is taken out of the title ("U2 - Gloria", "Gloria - U2"); if the title is only the artist's name,
 * the title was parsed the wrong way round and the other part becomes the title.
 */
export function forceArtist(t: Track, artist: string): Track {
  const a = artist.trim();
  const same = (x: string) => x.trim().toLowerCase() === a.toLowerCase();
  let title = t.title;
  if (same(title) && t.artists[0] && !same(t.artists[0])) title = t.artists[0];
  else {
    const stripped = title.replace(new RegExp(`^\\s*${esc(a)}\\s*[-–—:|]\\s*`, "i"), "").replace(new RegExp(`\\s*[-–—:|]\\s*${esc(a)}\\s*$`, "i"), "").trim();
    if (stripped) title = stripped;
  }
  return { ...t, title, artists: [a] };
}

/** One browser's own corrections, sent when it creates a room: they apply to that room only and win over the defaults. */
export interface Local { tracks: Record<string, TrackEdit>; banned: Set<string>; artists: Record<string, string> }

export function sanitizeLocal(raw: unknown): Local {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const out: Local = { tracks: {}, banned: new Set(), artists: {} };
  const id = /^[\w-]{6,64}$/;
  if (r.tracks && typeof r.tracks === "object") {
    for (const [k, v] of Object.entries(r.tracks).slice(0, 3000)) {
      if (!id.test(k) || !v || typeof v !== "object") continue;
      const title = clean((v as any).title, 120);
      const artists = (Array.isArray((v as any).artists) ? (v as any).artists : []).map((a: unknown) => clean(a, 80)).filter(Boolean).slice(0, 6);
      if (title || artists.length) out.tracks[k] = { ...(title ? { title } : {}), ...(artists.length ? { artists } : {}) };
    }
  }
  if (Array.isArray(r.banned)) for (const b of r.banned.slice(0, 5000)) if (typeof b === "string" && id.test(b)) out.banned.add(b);
  if (r.artists && typeof r.artists === "object") for (const [k, v] of Object.entries(r.artists).slice(0, 100)) if (id.test(k) && typeof v === "string") out.artists[k] = clean(v, 80); // "" = switched off here
  return out;
}

/** The artist a playlist is limited to: this browser's choice if it made one ("" = off), else the default for everyone. */
export function effectiveArtist(local: Local, playlistId: string, global: string | undefined): string | undefined {
  return playlistId in local.artists ? local.artists[playlistId] || undefined : global;
}
