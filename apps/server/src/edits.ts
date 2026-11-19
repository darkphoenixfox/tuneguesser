import fs from "node:fs";
import path from "node:path";
import type { Track } from "./music";

export interface TrackEdit { title?: string; artists?: string[] }
export interface PlaylistSettings { /** only songs by this artist are used */ artist?: string }
interface Data { tracks: Record<string, TrackEdit>; playlists: Record<string, PlaylistSettings> }

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
      return { tracks: d?.tracks ?? {}, playlists: d?.playlists ?? {} };
    } catch { return { tracks: {}, playlists: {} }; }
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
    const a = clean(artist, 80);
    if (a) d.playlists[playlistId] = { artist: a }; else delete d.playlists[playlistId];
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
