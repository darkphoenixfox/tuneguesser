export interface Track {
  id: string;
  uri: string;
  title: string;
  artists: string[];
  durationMs: number;
  albumArt?: string;
  year?: string;
}

/** Anything that can supply tracks and play a clip of one. Spotify now; YouTube later. */
export interface MusicProvider {
  loadTracks(): Promise<Track[]>;
  play(track: Track, startMs: number): Promise<void>;
  pause(): Promise<void>;
  /** Continue a paused track exactly where it stopped. `positionMs` is only a fallback if the source can't resume. */
  resume(track: Track, positionMs: number): Promise<void>;
}

/** Silent provider for development and tests. */
export class DemoProvider implements MusicProvider {
  readonly played: Array<{ id: string; startMs: number }> = [];
  readonly resumed: Array<{ id: string; positionMs: number }> = [];
  pauses = 0;
  async loadTracks(): Promise<Track[]> {
    const t = (n: number, title: string, artists: string[], year: string): Track => ({
      id: `demo${n}`, uri: `demo:${n}`, title, artists, durationMs: 200_000, year,
    });
    return [
      t(1, "Bohemian Rhapsody (Remastered 2011)", ["Queen"], "1975"),
      t(2, "Get Lucky (feat. Pharrell Williams)", ["Daft Punk", "Pharrell Williams"], "2013"),
      t(3, "Billie Jean", ["Michael Jackson"], "1982"),
      t(4, "Smells Like Teen Spirit", ["Nirvana"], "1991"),
      t(5, "Rolling in the Deep", ["Adele"], "2010"),
      t(6, "Hey Jude - Remastered 2015", ["The Beatles"], "1968"),
    ];
  }
  async play(track: Track, startMs: number) { this.played.push({ id: track.id, startMs }); }
  async pause() { this.pauses++; }
  async resume(track: Track, positionMs: number) { this.resumed.push({ id: track.id, positionMs }); }
}
