import { DEFAULT_SCORE, matchFreeText, pointsFor, type Found, type PlayerPublic, type RoomState, type RevealInfo } from "@tuneguesser/shared";
import type { MusicProvider, Track } from "./music";

export interface RoomOptions {
  rounds: number;
  roundMs: number;
  /** how long the player who pressed ANSWER has to send their guess */
  guessMs: number;
  /** wrong/timed-out answers allowed per player per round */
  maxAttempts: number;
  revealMs: number;
}

interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** wrong or timed-out answers this round */
  attemptsUsed: number;
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

/**
 * Buzzer game. Music plays; the first player to press ANSWER stops the music and the round clock and gets
 * a limited time to send a guess. Correct parts (title / artist) are scored and shown to everyone; if the
 * song isn't fully found the music resumes where it stopped, until someone else buzzes or time runs out.
 */
export class Room {
  readonly players = new Map<string, Player>();
  private phase: RoomState["phase"] = "lobby";
  private queue: Track[] = [];
  private current?: Track;
  private round = 0;
  private startMs = 0;
  /** effective start of the running clock: elapsed play time = now - roundStartedAt */
  private roundStartedAt?: number;
  private guesser?: string;
  private guessStartedAt = 0;
  /** play time elapsed at the moment the guesser buzzed (also used for scoring) */
  private frozenElapsed = 0;
  private found: Found = {};
  private reveal?: RevealInfo;
  private timer?: NodeJS.Timeout;
  private guessTimer?: NodeJS.Timeout;
  /** the pause request sent when someone buzzed; a resume must wait for it so they can't arrive out of order */
  private pausing: Promise<void> = Promise.resolve();
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
    this.players.set(id, { id, name: name.trim().slice(0, 16) || "Player", score: 0, connected: true, attemptsUsed: 0, gain: { title: 0, artist: 0 } });
    this.onChange();
    return id;
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (p) { p.connected = connected; this.onChange(); }
  }

  /** A player exits on purpose: frees their slot in the lobby; mid-game they just drop out (and a pending guess ends). */
  leave(id: string) {
    if (!this.players.has(id)) return;
    if (this.phase === "lobby") {
      this.players.delete(id);
      this.onChange();
      return;
    }
    const gone = this.players.get(id)!;
    gone.connected = false;
    gone.attemptsUsed = this.opts.maxAttempts; // out for this round (and the rest of the game)
    if (this.guesser === id) void this.finishGuess();
    else this.onChange();
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
    clearTimeout(this.guessTimer);
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
    this.found = {};
    this.guesser = undefined;
    for (const p of this.players.values()) { p.attemptsUsed = 0; p.gain = { title: 0, artist: 0 }; }
    // start somewhere in the middle so we don't always get the intro
    const maxStart = Math.max(0, track.durationMs - this.opts.roundMs - 5_000);
    this.startMs = Math.floor((0.15 + Math.random() * 0.5) * maxStart);
    this.phase = "playing";
    this.roundStartedAt = this.now();
    await this.music.play(track, this.startMs);
    this.roundStartedAt = this.now();
    this.timer = setTimeout(() => void this.endRound(), this.opts.roundMs);
    this.onChange();
  }

  /** A player presses ANSWER. First press wins; the music and the round clock stop. */
  buzz(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || this.guesser || p.attemptsUsed >= this.opts.maxAttempts || this.roundStartedAt === undefined) return false;
    this.guesser = playerId;
    this.guessStartedAt = this.now();
    this.frozenElapsed = this.guessStartedAt - this.roundStartedAt;
    clearTimeout(this.timer);
    this.pausing = this.music.pause().catch(() => {});
    this.guessTimer = setTimeout(() => void this.finishGuess(), this.opts.guessMs);
    this.onChange();
    return true;
  }

  /** The buzzed player sends their answer. Only parts not yet found are considered. */
  async answer(playerId: string, text: string): Promise<{ title: boolean; artist: boolean } | undefined> {
    const p = this.players.get(playerId);
    if (!p || this.guesser !== playerId || !this.current) return;
    // one free-text field: the title, the artist, or both. Parts that were already found don't count again.
    const hit = matchFreeText(text, { title: this.current.title, artists: this.current.artists });
    const m = { title: hit.title && !this.found.title, artist: hit.artist && !this.found.artist };
    if (m.title) {
      p.gain.title = pointsFor(DEFAULT_SCORE.titleMax, this.frozenElapsed, this.opts.roundMs);
      p.score += p.gain.title;
      this.found.title = { text: this.current.title, by: p.name };
    }
    if (m.artist) {
      p.gain.artist = pointsFor(DEFAULT_SCORE.artistMax, this.frozenElapsed, this.opts.roundMs);
      p.score += p.gain.artist;
      this.found.artist = { text: this.current.artists.join(", "), by: p.name };
    }
    // a guess that found the title or the artist is free; only a fully wrong answer uses an attempt
    await this.finishGuess(!(m.title || m.artist));
    return m;
  }

  /** Ends the current guess (answered, or timed out) and either resumes the music or ends the round. */
  private async finishGuess(consumeAttempt = true): Promise<void> {
    if (!this.guesser || !this.current) return;
    clearTimeout(this.guessTimer);
    const p = this.players.get(this.guesser);
    if (p && consumeAttempt) p.attemptsUsed++;
    this.guesser = undefined;
    const everythingFound = !!this.found.title && !!this.found.artist;
    const everyoneTried = [...this.players.values()].every((x) => x.attemptsUsed >= this.opts.maxAttempts);
    if (everythingFound || everyoneTried) return this.endRound();
    this.roundStartedAt = this.now() - this.frozenElapsed;
    this.timer = setTimeout(() => void this.endRound(), Math.max(0, this.opts.roundMs - this.frozenElapsed));
    this.onChange();
    await this.pausing;
    await this.music.resume(this.current, this.startMs + this.frozenElapsed).catch(() => {});
  }

  async endRound(): Promise<void> {
    if (this.phase !== "playing" || !this.current) return;
    clearTimeout(this.timer);
    clearTimeout(this.guessTimer);
    this.guesser = undefined;
    this.phase = "reveal";
    await this.music.pause().catch(() => {});
    const gains: RevealInfo["gains"] = {};
    for (const p of this.players.values()) gains[p.id] = { ...p.gain };
    this.reveal = { title: this.current.title, artists: this.current.artists, albumArt: this.current.albumArt, year: this.current.year, gains };
    this.timer = setTimeout(() => void this.nextRound(), this.opts.revealMs);
    this.onChange();
  }

  dispose() { clearTimeout(this.timer); clearTimeout(this.guessTimer); }

  state(): RoomState {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, attemptsLeft: Math.max(0, this.opts.maxAttempts - p.attemptsUsed) }));
    const playing = this.phase === "playing" && this.roundStartedAt !== undefined;
    const g = this.guesser ? this.players.get(this.guesser) : undefined;
    return {
      code: this.code,
      phase: this.phase,
      players,
      round: this.round,
      totalRounds: this.round + this.queue.length,
      roundMs: this.opts.roundMs,
      guessMs: this.opts.guessMs,
      maxAttempts: this.opts.maxAttempts,
      remainingMs: playing ? Math.max(0, this.opts.roundMs - (g ? this.frozenElapsed : this.now() - this.roundStartedAt!)) : undefined,
      guesser: g ? { id: g.id, name: g.name } : undefined,
      guessRemainingMs: g ? Math.max(0, this.opts.guessMs - (this.now() - this.guessStartedAt)) : undefined,
      found: this.phase === "playing" ? { ...this.found } : undefined,
      reveal: this.reveal,
      hostConnected: this.hostConnected,
    };
  }
}
