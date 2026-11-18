import { DEFAULT_SCORE, matchAnswer, pointsFor, type PlayerPublic, type RoomState, type RevealInfo } from "@tuneguesser/shared";
import type { MusicProvider, Track } from "./music";

export interface RoomOptions {
  rounds: number;
  roundMs: number;
  revealMs: number;
}

interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  gotTitle: boolean;
  gotArtist: boolean;
  answered: boolean;
  gain: { title: number; artist: number };
}

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
};

export class Room {
  readonly players = new Map<string, Player>();
  private phase: RoomState["phase"] = "lobby";
  private queue: Track[] = [];
  private current?: Track;
  private round = 0;
  private roundStartedAt?: number;
  private reveal?: RevealInfo;
  private timer?: NodeJS.Timeout;
  hostConnected = false;
  onChange: () => void = () => {};

  constructor(
    readonly code: string,
    private music: MusicProvider,
    private opts: RoomOptions,
    private now: () => number = Date.now,
  ) {}

  addPlayer(name: string, existingId?: string): string | null {
    const prior = existingId ? this.players.get(existingId) : undefined;
    if (prior) { prior.connected = true; this.onChange(); return prior.id; }
    if (this.phase !== "lobby" || this.players.size >= 4) return null;
    const id = Math.random().toString(36).slice(2, 10);
    this.players.set(id, { id, name: name.trim().slice(0, 16) || "Player", score: 0, connected: true, gotTitle: false, gotArtist: false, answered: false, gain: { title: 0, artist: 0 } });
    this.onChange();
    return id;
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (p) { p.connected = connected; this.onChange(); }
  }

  async start(): Promise<void> {
    if (this.phase !== "lobby" || this.players.size === 0) return;
    const tracks = await this.music.loadTracks();
    this.queue = shuffle(tracks).slice(0, this.opts.rounds);
    if (!this.queue.length) throw new Error("No playable tracks in that playlist");
    this.round = 0;
    await this.nextRound();
  }

  async nextRound(): Promise<void> {
    clearTimeout(this.timer);
    const track = this.queue.shift();
    if (!track) {
      this.phase = "finished";
      await this.music.pause().catch(() => {});
      this.onChange();
      return;
    }
    this.current = track;
    this.round++;
    this.reveal = undefined;
    for (const p of this.players.values()) { p.gotTitle = p.gotArtist = p.answered = false; p.gain = { title: 0, artist: 0 }; }
    // start somewhere in the middle so we don't always get the intro
    const maxStart = Math.max(0, track.durationMs - this.opts.roundMs - 5_000);
    const startMs = Math.floor((0.15 + Math.random() * 0.5) * maxStart);
    this.phase = "playing";
    this.roundStartedAt = this.now();
    await this.music.play(track, startMs);
    this.roundStartedAt = this.now();
    this.timer = setTimeout(() => void this.endRound(), this.opts.roundMs);
    this.onChange();
  }

  answer(playerId: string, guess: { title?: string; artist?: string }) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || !this.current || this.roundStartedAt === undefined) return;
    const elapsed = this.now() - this.roundStartedAt;
    const m = matchAnswer(guess, { title: this.current.title, artists: this.current.artists });
    if (m.title && !p.gotTitle) {
      p.gotTitle = true;
      p.gain.title = pointsFor(DEFAULT_SCORE.titleMax, elapsed, this.opts.roundMs);
      p.score += p.gain.title;
    }
    if (m.artist && !p.gotArtist) {
      p.gotArtist = true;
      p.gain.artist = pointsFor(DEFAULT_SCORE.artistMax, elapsed, this.opts.roundMs);
      p.score += p.gain.artist;
    }
    p.answered = p.gotTitle && p.gotArtist;
    this.onChange();
    if ([...this.players.values()].every((x) => x.answered)) void this.endRound();
  }

  async endRound(): Promise<void> {
    if (this.phase !== "playing" || !this.current) return;
    clearTimeout(this.timer);
    this.phase = "reveal";
    await this.music.pause().catch(() => {});
    const gains: RevealInfo["gains"] = {};
    for (const p of this.players.values()) gains[p.id] = { ...p.gain };
    this.reveal = { title: this.current.title, artists: this.current.artists, albumArt: this.current.albumArt, year: this.current.year, gains };
    this.timer = setTimeout(() => void this.nextRound(), this.opts.revealMs);
    this.onChange();
  }

  dispose() { clearTimeout(this.timer); }

  state(): RoomState {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, answered: p.answered }));
    return {
      code: this.code,
      phase: this.phase,
      players,
      round: this.round,
      totalRounds: this.round + this.queue.length,
      roundMs: this.opts.roundMs,
      roundStartedAt: this.phase === "playing" ? this.roundStartedAt : undefined,
      reveal: this.reveal,
      hostConnected: this.hostConnected,
    };
  }
}
