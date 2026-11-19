import {
  DEFAULT_SCORE,
  hintText,
  letterPositions,
  maskText,
  matchFreeText,
  multipliersFor,
  pointsFor,
  revealCount,
  totalMultiplier,
  type ChoiceOption,
  type Found,
  type GameConfig,
  type HighScores,
  type LastScore,
  type Multiplier,
  type PlayerPublic,
  type RevealInfo,
  type RoomState,
} from "@tuneguesser/shared";
import type { MusicProvider, Track } from "./music";

export interface RoomOptions {
  /** how long the player who pressed ANSWER has to send their guess */
  guessMs: number;
  /** time to answer for players using the gamepad's on-screen keyboard (slower than typing) */
  slowGuessMs?: number;
  /** how long the answer is shown before the next song when auto-advance is on */
  revealMs: number;
}

export interface TriviaSource {
  prefetch(track: Track): void;
  peek(track: Track): string[];
}

export interface AnswerResult {
  title: boolean;
  artist: boolean;
  points: number;
  multipliers: Multiplier[];
}

interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** wrong or timed-out answers this round */
  attemptsUsed: number;
  skipVote: boolean;
  /** consecutive earlier rounds in which this player scored */
  streak: number;
  gain: { title: number; artist: number };
}

interface Choice extends ChoiceOption {
  correct: boolean;
}

const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
};

/** Points fade over this long when the timer is unlimited. */
const UNLIMITED_SCORE_WINDOW_MS = 40_000;
/** With an unlimited timer the "Reveal"/"Trivia" hints unfold over this long. */
const UNLIMITED_HINT_WINDOW_MS = 60_000;
/** No letters are revealed before this much of the round has passed. */
const HINT_DELAY_MS = 10_000;
const HINT_GRACE_MS = 5_000;
/** Extra time after the computed end of a song before moving on (latency, gaps). */
const SONG_END_BUFFER_MS = 800;

/**
 * One game. Music plays; a player presses ANSWER (buzzer: the first one; round robin: only the player whose
 * turn it is), which stops the music and the round clock while they answer. Correct parts are scored and
 * shown to everyone; if the song isn't fully found the music resumes where it stopped.
 */
export class Room {
  readonly players = new Map<string, Player>();
  private phase: RoomState["phase"] = "lobby";
  private pool: Track[] = [];
  private queue: Track[] = [];
  /** ids of the songs already played this game */
  private played = new Set<string>();
  private current?: Track;
  private round = 0;
  private startMs = 0;
  /** effective start of the running clock: elapsed play time = now - roundStartedAt */
  private roundStartedAt?: number;
  private guesser?: string;
  private guessStartedAt = 0;
  private guessLimit = 0;
  /** players answering with the on-screen keyboard get longer */
  private slowInput = new Set<string>();
  /** play time elapsed at the moment the guesser buzzed (also used for scoring) */
  private frozenElapsed = 0;
  /** counts rounds: a delayed "resume" of an earlier song must not run once the next song has started */
  private epoch = 0;
  /** game clock for "play to a score": started with the first round, stopped when the target is reached; pauses do not count */
  private gameStartedAt?: number;
  private pausedMs = 0;
  private pauseStartedAt?: number;
  private finishMs?: number;
  private board?: HighScores;
  /** called once when a game ends by itself (not when the host quits): saves the results and returns the high-score table */
  onFinish?: (r: { players: Array<{ name: string; score: number }>; timeMs?: number }) => HighScores | undefined;
  private found: Found = {};
  private lastScore?: LastScore;
  private reveal?: RevealInfo;
  private timer?: NodeJS.Timeout;
  private guessTimer?: NodeJS.Timeout;
  private hintTicker?: NodeJS.Timeout;
  /** the pause request sent when someone buzzed; a resume must wait for it so they can't arrive out of order */
  private pausing: Promise<void> = Promise.resolve();
  /** the song is paused because a player buzzed */
  private musicPaused = false;
  /** paused by a player or the host (not by a buzz) */
  private paused = false;
  hostConnected = false;
  private hostSkipVote = false;
  /** set when the host also plays: the host then has one vote, as that player */
  private hostPlayerId?: string;
  private awaitingNext = false;
  /** song position (ms) and wall-clock time when the reveal began (to know when the song ends) */
  private revealAt = 0;
  private posAtReveal = 0;
  // round robin
  private rrNext = 0;
  private activeId?: string;
  // multiple choice
  private choices: Choice[] = [];
  private eliminated = new Map<string, Set<string>>();
  // hints
  private hintOrder = { title: [] as number[], artist: [] as number[] };
  private hintTitle = "";
  private hintArtist = "";

  onChange: () => void = () => {};
  /** music problems (e.g. Spotify refused to pause) are reported here so the host can see them */
  onError: (message: string) => void = () => {};
  /** music is played by YouTube players in the browsers (the host's, and the players' who opted in) */
  youtube = false;

  private musicError = (what: string) => (e: unknown) => {
    console.error(`music ${what} failed:`, e);
    this.onError(`Music ${what} failed: ${e instanceof Error ? e.message.slice(0, 160) : "unknown error"}`);
  };

  constructor(
    readonly code: string,
    private music: MusicProvider,
    private config: GameConfig,
    private opts: RoomOptions,
    private trivia?: TriviaSource,
    private now: () => number = Date.now,
  ) {}

  /** ms of the round clock, or null when the timer is unlimited */
  private get limitMs(): number | null {
    return this.config.roundSeconds === null ? null : this.config.roundSeconds * 1000;
  }
  /** the time points (and hints) are spread over */
  private get scoreWindowMs(): number {
    return this.limitMs ?? UNLIMITED_SCORE_WINDOW_MS;
  }
  private get wantTitle(): boolean { return this.config.guess !== "artist"; }
  private get wantArtist(): boolean { return this.config.guess !== "title"; }
  private get hintWindowMs(): number {
    return this.limitMs ?? UNLIMITED_HINT_WINDOW_MS;
  }
  private elapsed(): number {
    if (this.roundStartedAt === undefined) return 0;
    return this.guesser || this.paused ? this.frozenElapsed : this.now() - this.roundStartedAt;
  }

  // ---------------------------------------------------------------- players

  addPlayer(name: string, existingId?: string): string | null {
    const prior = existingId ? this.players.get(existingId) : undefined;
    if (prior) { prior.connected = true; this.onChange(); return prior.id; }
    if (this.phase !== "lobby" || this.players.size >= 4) return null;
    const id = Math.random().toString(36).slice(2, 10);
    this.players.set(id, { id, name: name.trim().slice(0, 16) || "Player", score: 0, connected: true, attemptsUsed: 0, skipVote: false, streak: 0, gain: { title: 0, artist: 0 } });
    this.onChange();
    return id;
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.checkSkip(); // the remaining players may now all want to skip
  }

  setHostConnected(connected: boolean) {
    this.hostConnected = connected;
    this.onChange();
    if (!connected) this.checkSkip();
  }

  /** The host also plays as this player: they get one skip vote, not two. */
  markHostPlayer(id: string) {
    if (this.players.has(id)) this.hostPlayerId = id;
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
    gone.attemptsUsed = this.config.attempts; // out for this round (and the rest of the game)
    gone.skipVote = false;
    if (this.guesser === id) void this.finishGuess();
    else this.onChange();
    this.checkSkip();
  }

  // ---------------------------------------------------------------- skipping

  /** Who has to agree to skip: everybody connected (buzzer), or only the player whose turn it is (round robin). */
  private voters(): Player[] {
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (this.config.order !== "roundRobin") return connected;
    return connected.filter((p) => p.id === this.activeId);
  }

  /** The host's own skip vote (or, if the host plays, that player's vote). */
  voteSkipHost() {
    if (this.hostPlayerId && this.players.has(this.hostPlayerId)) return this.voteSkip(this.hostPlayerId);
    if (this.phase !== "playing") return;
    this.hostSkipVote = !this.hostSkipVote;
    this.onChange();
    this.checkSkip();
  }

  /** A player toggles their vote to skip this song. When every voter wants to, the round ends. */
  voteSkip(id: string) {
    const p = this.players.get(id);
    if (!p || this.phase !== "playing") return;
    if (this.config.order === "roundRobin" && id !== this.activeId) return; // not their song
    p.skipVote = !p.skipVote;
    this.onChange();
    this.checkSkip();
  }

  private checkSkip() {
    if (this.phase !== "playing") return;
    const voters = this.voters();
    if (this.config.order === "roundRobin" && voters.length === 0) return void this.endRound(); // the player whose turn it was is gone
    const hostIsVoter = !this.hostPlayerId && this.hostConnected;
    if (voters.length > 0 && voters.every((p) => p.skipVote) && (!hostIsVoter || this.hostSkipVote)) void this.endRound();
  }

  private skipInfo() {
    const voters = this.voters();
    const hostIsVoter = !this.hostPlayerId && this.hostConnected;
    const hostPlayer = this.hostPlayerId ? this.players.get(this.hostPlayerId) : undefined;
    return {
      votes: voters.filter((p) => p.skipVote).length + (hostIsVoter && this.hostSkipVote ? 1 : 0),
      voters: voters.length + (hostIsVoter ? 1 : 0),
      host: hostPlayer ? hostPlayer.skipVote : this.hostSkipVote,
    };
  }

  // ---------------------------------------------------------------- rounds

  async start(): Promise<void> {
    if (this.phase !== "lobby" || this.players.size === 0) return;
    this.pool = await this.music.loadTracks();
    if (!this.pool.length) throw new Error("No playable tracks in that playlist");
    const all = shuffle(this.pool);
    this.queue = this.config.playTo.kind === "rounds" ? all.slice(0, this.config.playTo.rounds) : all;
    this.round = 0;
    this.gameStartedAt = this.now();
    await this.nextRound();
  }

  /** The game ended by itself: save the results (rounds: everyone's points; target score: those who got there, with the time). */
  private saveResults() {
    if (this.board || !this.onFinish) return;
    const isScore = this.config.playTo.kind === "score";
    if (isScore && !this.targetReached()) return; // the songs ran out first: not a result
    const target = isScore ? (this.config.playTo as { target: number }).target : 0;
    const players = [...this.players.values()].filter((p) => (isScore ? p.score >= target : p.score > 0)).map((p) => ({ name: p.name, score: p.score }));
    try { this.board = this.onFinish({ players, timeMs: isScore ? this.gameMs() : undefined }); } catch (e) { console.warn("high scores:", (e as Error).message); }
  }

  private endPause() {
    if (this.pauseStartedAt !== undefined) { this.pausedMs += this.now() - this.pauseStartedAt; this.pauseStartedAt = undefined; }
  }

  /** ms of play so far (the game clock) */
  private gameMs(): number {
    if (this.gameStartedAt === undefined) return 0;
    if (this.finishMs !== undefined) return this.finishMs;
    const pausedNow = this.pauseStartedAt !== undefined ? this.now() - this.pauseStartedAt : 0;
    return Math.max(0, this.now() - this.gameStartedAt - this.pausedMs - pausedNow);
  }

  private targetReached(): boolean {
    return this.config.playTo.kind === "score" && [...this.players.values()].some((p) => p.score >= (this.config.playTo as { target: number }).target);
  }

  async nextRound(): Promise<void> {
    clearTimeout(this.timer);
    clearTimeout(this.guessTimer);
    clearInterval(this.hintTicker);
    const track = this.targetReached() ? undefined : this.queue.shift();
    if (!track) {
      this.phase = "finished";
      this.saveResults();
      this.awaitingNext = false;
      await this.music.pause().catch(() => {});
      this.onChange();
      return;
    }
    this.epoch++;
    this.current = track;
    this.played.add(track.id);
    this.round++;
    this.reveal = undefined;
    this.found = {};
    this.lastScore = undefined;
    this.guesser = undefined;
    this.paused = false;
    this.endPause();
    this.musicPaused = false;
    for (const p of this.players.values()) { p.attemptsUsed = 0; p.skipVote = false; p.gain = { title: 0, artist: 0 }; }
    this.hostSkipVote = false;
    this.awaitingNext = false;
    this.eliminated.clear();
    this.pickActivePlayer();
    this.prepareChoices(track);
    this.prepareHints(track);
    // "random": anywhere, but at least 20 s before the end, and never so late that the song ends before the round timer does
    // (a few seconds extra: the player needs a moment to start)
    const needMs = Math.max(20_000, (this.limitMs ?? 0) + 3_000);
    this.startMs = this.config.start === "beginning" ? 0 : Math.floor(Math.random() * Math.max(0, track.durationMs - needMs));
    this.phase = "playing";
    this.roundStartedAt = this.now();
    // a refused play (device asleep, Spotify 404/502) must not crash the server: report it and let the round run
    await this.pausing; // a pause still on its way (Spotify) must not land after this play
    if (this.current !== track) return; // the host was even quicker: another round has started meanwhile
    await this.music.play(track, this.startMs).catch(this.musicError("play"));
    this.startClock(0);
    if (this.config.hints.reveal || this.config.hints.trivia || this.config.hints.art) this.hintTicker = setInterval(() => { if (!this.guesser) this.onChange(); }, 1000);
    this.onChange();
  }

  /** Round robin: the next connected player in turn gets this song. */
  private pickActivePlayer() {
    this.activeId = undefined;
    if (this.config.order !== "roundRobin") return;
    const list = [...this.players.values()];
    for (let i = 0; i < list.length; i++) {
      const p = list[(this.rrNext + i) % list.length]!;
      if (p.connected) {
        this.activeId = p.id;
        this.rrNext = (this.rrNext + i + 1) % list.length;
        return;
      }
    }
  }

  private prepareChoices(track: Track) {
    this.choices = [];
    if (this.config.answers !== "choice") return;
    const label = (t: Track) => {
      const ti = hintText(t.title), ar = t.artists[0] ?? "";
      return this.config.guess === "title" ? ti : this.config.guess === "artist" ? ar : `${ti} — ${ar}`;
    };
    const right = label(track);
    const wrong: string[] = [];
    for (const t of shuffle(this.pool)) {
      const l = label(t);
      if (l !== right && !wrong.includes(l)) wrong.push(l);
      if (wrong.length === 3) break;
    }
    if (wrong.length === 0) return; // nothing to choose from: this round falls back to typing
    this.choices = shuffle([{ label: right, correct: true }, ...wrong.map((label) => ({ label, correct: false }))]).map((c, i) => ({ id: `o${i}`, ...c }));
  }

  private prepareHints(track: Track) {
    this.hintTitle = hintText(track.title);
    this.hintArtist = track.artists.join(", ");
    this.hintOrder = { title: shuffle(letterPositions(this.hintTitle)), artist: shuffle(letterPositions(this.hintArtist)) };
    if (this.config.hints.trivia && this.trivia) {
      this.trivia.prefetch(track);
      const upcoming = this.queue[0];
      if (upcoming) this.trivia.prefetch(upcoming);
    }
  }

  /** (Re)starts the round clock with `elapsed` ms already played. Ends the round when time is up (or the song ends, if unlimited). */
  private startClock(elapsed: number) {
    clearTimeout(this.timer);
    this.roundStartedAt = this.now() - elapsed;
    const track = this.current!;
    const left = this.limitMs !== null ? this.limitMs - elapsed : track.durationMs - (this.startMs + elapsed) + SONG_END_BUFFER_MS;
    this.timer = setTimeout(() => void this.endRound(), Math.max(0, left));
  }

  // ---------------------------------------------------------------- answering

  /** Pause or continue the round (music and clock). Not while someone is answering: that already stops both. */
  togglePause() {
    if (this.phase !== "playing" || this.guesser || this.roundStartedAt === undefined || !this.current) return;
    if (!this.paused) {
      this.paused = true;
      this.pauseStartedAt = this.now();
      this.frozenElapsed = this.now() - this.roundStartedAt;
      clearTimeout(this.timer);
      this.musicPaused = true;
      this.pausing = this.music.pause().catch(this.musicError("pause"));
      this.onChange();
      return;
    }
    this.paused = false;
    this.endPause();
    this.startClock(this.frozenElapsed);
    this.onChange();
    this.musicPaused = false;
    const [track, e] = [this.current, this.epoch];
    void this.pausing.then(() => (e === this.epoch ? this.music.resume(track, this.startMs + this.frozenElapsed) : undefined)).catch(this.musicError("resume"));
  }

  /** A player presses ANSWER. The first press wins; the music and the round clock stop. */
  buzz(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || this.phase !== "playing" || this.guesser || p.attemptsUsed >= this.config.attempts || this.roundStartedAt === undefined || this.paused) return false;
    if (this.config.order === "roundRobin" && playerId !== this.activeId) return false; // not their song
    this.guesser = playerId;
    this.guessStartedAt = this.now();
    this.frozenElapsed = this.guessStartedAt - this.roundStartedAt;
    clearTimeout(this.timer);
    this.musicPaused = true;
    this.pausing = this.music.pause().catch(this.musicError("pause"));
    this.guessLimit = this.slowInput.has(playerId) ? (this.opts.slowGuessMs ?? this.opts.guessMs) : this.opts.guessMs;
    this.guessTimer = setTimeout(() => void this.finishGuess(), this.guessLimit);
    this.onChange();
    return true;
  }

  /** Scores the parts just found by `p`, applying the multipliers. */
  private award(p: Player, parts: { title: boolean; artist: boolean }): { points: number; multipliers: Multiplier[] } {
    const track = this.current!;
    const t = Math.min(this.frozenElapsed, this.scoreWindowMs);
    const multipliers = this.config.multipliers
      ? multipliersFor({ both: this.config.guess === "both" && parts.title && parts.artist && this.config.answers === "type", streak: p.streak })
      : [];
    const x = totalMultiplier(multipliers);
    let points = 0;
    if (parts.title) {
      const g = Math.round(pointsFor(DEFAULT_SCORE.titleMax, t, this.scoreWindowMs) * x);
      p.gain.title += g;
      points += g;
      this.found.title = { text: track.title, by: p.name };
    }
    if (parts.artist) {
      const g = Math.round(pointsFor(this.config.guess === "artist" ? DEFAULT_SCORE.titleMax : DEFAULT_SCORE.artistMax, t, this.scoreWindowMs) * x);
      p.gain.artist += g;
      points += g;
      this.found.artist = { text: track.artists.join(", "), by: p.name };
    }
    p.score += points;
    if (this.finishMs === undefined && this.gameStartedAt !== undefined && this.targetReached()) this.finishMs = this.gameMs();
    if (points > 0) this.lastScore = { name: p.name, points, multipliers };
    return { points, multipliers };
  }

  /** A player's device uses the on-screen keyboard (gamepad): they get more time to answer. */
  setSlowInput(playerId: string, on: boolean) {
    if (on) this.slowInput.add(playerId); else this.slowInput.delete(playerId);
  }

  /** The guesser gives up this turn without answering: no attempt is used and the music resumes. */
  async cancelGuess(playerId: string) {
    if (this.guesser === playerId) await this.finishGuess(false);
  }

  /** Typed answer: the song, the artist, or both. Parts that were already found don't count again. */
  async answer(playerId: string, text: string): Promise<AnswerResult | undefined> {
    const p = this.players.get(playerId);
    if (!p || this.guesser !== playerId || !this.current) return;
    if (this.choices.length > 0) return; // this round is multiple choice
    const hit = matchFreeText(text, { title: this.current.title, artists: this.current.artists });
    const m = { title: this.wantTitle && hit.title && !this.found.title, artist: this.wantArtist && hit.artist && !this.found.artist };
    const { points, multipliers } = this.award(p, m);
    // a guess that found the title or the artist is free; only a fully wrong answer uses an attempt
    await this.finishGuess(!(m.title || m.artist));
    return { ...m, points, multipliers };
  }

  /** Multiple choice: pick one of the offered songs. The right one counts as title and artist. */
  async choose(playerId: string, optionId: string): Promise<AnswerResult | undefined> {
    const p = this.players.get(playerId);
    if (!p || this.guesser !== playerId || !this.current || this.choices.length === 0) return;
    const opt = this.choices.find((c) => c.id === optionId);
    if (!opt || this.eliminated.get(playerId)?.has(optionId)) return;
    if (!opt.correct) {
      this.eliminated.set(playerId, (this.eliminated.get(playerId) ?? new Set()).add(optionId));
      await this.finishGuess(true);
      return { title: false, artist: false, points: 0, multipliers: [] };
    }
    const m = { title: this.wantTitle && !this.found.title, artist: this.wantArtist && !this.found.artist };
    const { points, multipliers } = this.award(p, m);
    await this.finishGuess(false);
    return { ...m, points, multipliers };
  }

  /** Titles and artists of the playlist(s), for the on-screen keyboard's auto-completion. */
  suggestions(): string[] {
    const out = new Set<string>();
    for (const t of this.pool) {
      if (this.wantTitle) out.add(hintText(t.title));
      if (this.wantArtist) for (const a of t.artists) out.add(a);
    }
    return [...out].slice(0, 3000);
  }

  /** Who has to run out of attempts (or find everything) for the round to end. */
  private contenders(): Player[] {
    if (this.config.order !== "roundRobin") return [...this.players.values()];
    const a = this.activeId ? this.players.get(this.activeId) : undefined;
    return a ? [a] : [];
  }

  /** The song of the running round (playing or reveal), for thumbs up/down. */
  votableTrack(): { id: string; name: string } | undefined {
    return this.current && (this.phase === "playing" || this.phase === "reveal") ? { id: this.current.id, name: `${this.current.artists.join(", ")} — ${this.current.title}` } : undefined;
  }
  /**
   * The host rejected the song of the running round (thumbs down): drop it, queue another song in its place and start it now.
   * The round does not count (the number of rounds stays the same); points already scored stay.
   */
  async discardCurrent(): Promise<void> {
    const bad = this.current;
    if (!bad || (this.phase !== "playing" && this.phase !== "reveal")) return;
    this.queue = this.queue.filter((t) => t.id !== bad.id);
    this.pool = this.pool.filter((t) => t.id !== bad.id);
    if (this.config.playTo.kind === "rounds") {
      const queued = new Set(this.queue.map((t) => t.id));
      const spare = shuffle(this.pool.filter((t) => !this.played.has(t.id) && !queued.has(t.id)))[0];
      if (spare) this.queue.unshift(spare);
      else if (this.queue.length === 0) { /* nothing left to play: the game ends below */ }
    }
    this.round--; // nextRound counts it again
    await this.nextRound();
  }

  /** A blacklisted song must not come up again in this game. */
  dropTrack(id: string): void {
    this.queue = this.queue.filter((t) => t.id !== id);
    this.pool = this.pool.filter((t) => t.id !== id || t === this.current);
  }

  /** Ends the current guess (answered, or timed out) and either resumes the music or ends the round. */
  private async finishGuess(consumeAttempt = true): Promise<void> {
    if (!this.guesser || !this.current) return;
    clearTimeout(this.guessTimer);
    const p = this.players.get(this.guesser);
    if (p && consumeAttempt) p.attemptsUsed++;
    this.guesser = undefined;
    const everythingFound = (!this.wantTitle || !!this.found.title) && (!this.wantArtist || !!this.found.artist);
    const everyoneTried = this.contenders().every((x) => x.attemptsUsed >= this.config.attempts);
    if (everythingFound || everyoneTried) return this.endRound();
    this.startClock(this.frozenElapsed);
    this.onChange();
    this.musicPaused = false;
    const [track, e] = [this.current, this.epoch];
    await this.pausing;
    if (e !== this.epoch) return;
    await this.music.resume(track, this.startMs + this.frozenElapsed).catch(this.musicError("resume"));
  }

  // ---------------------------------------------------------------- reveal

  /**
   * Shows the answer. The song keeps playing during the reveal (resumed if a guess had paused it).
   * Auto-advance on: the next song starts after a few seconds. Off: the screen is held until the host
   * presses Next, or until the song ends.
   */
  async endRound(): Promise<void> {
    if (this.phase !== "playing" || !this.current) return;
    clearTimeout(this.timer);
    clearTimeout(this.guessTimer);
    clearInterval(this.hintTicker);
    const elapsed = this.elapsed();
    this.guesser = undefined;
    this.paused = false;
    this.endPause();
    this.phase = "reveal";
    // streaks: a round in which a player scored continues their streak, otherwise it resets
    for (const p of this.contenders()) p.streak = p.gain.title + p.gain.artist > 0 ? p.streak + 1 : 0;
    const gains: RevealInfo["gains"] = {};
    for (const p of this.players.values()) gains[p.id] = { ...p.gain };
    this.reveal = { title: this.current.title, artists: this.current.artists, albumArt: this.current.albumArt, year: this.current.year, gains };
    this.awaitingNext = !this.config.autoAdvance;
    this.revealAt = this.now();
    this.posAtReveal = this.startMs + elapsed;
    this.scheduleAfterReveal();
    this.onChange();
    if (this.musicPaused) {
      this.musicPaused = false;
      const [track, e] = [this.current, this.epoch];
      await this.pausing;
      if (e !== this.epoch) return; // Next was pressed before the song could resume: do not bring the old song back
      await this.music.resume(track, this.startMs + this.frozenElapsed).catch(this.musicError("resume"));
    }
  }

  /** What happens after the reveal: next song soon (auto) or when the song has finished playing (held). */
  private scheduleAfterReveal() {
    clearTimeout(this.timer);
    if (this.config.autoAdvance) {
      this.timer = setTimeout(() => void this.nextRound(), this.opts.revealMs);
      return;
    }
    const pos = this.posAtReveal + (this.now() - this.revealAt);
    const left = this.current!.durationMs - pos + SONG_END_BUFFER_MS;
    this.timer = setTimeout(() => void this.nextRound(), Math.max(0, left));
  }

  /** Host changes a setting. Takes effect at once, also on a reveal that is already showing. */
  setSettings(s: { autoAdvance?: boolean }) {
    if (typeof s.autoAdvance === "boolean" && s.autoAdvance !== this.config.autoAdvance) {
      this.config.autoAdvance = s.autoAdvance;
      if (this.phase === "reveal") {
        this.awaitingNext = !s.autoAdvance;
        this.scheduleAfterReveal();
      }
    }
    this.onChange();
  }

  /** The host moves the music to another device; the song carries on there (or stays paused if it is paused now). */
  async setDevice(deviceId: string) {
    if (!this.music.setDevice) return;
    const playingNow = (this.phase === "playing" || this.phase === "reveal") && !this.musicPaused;
    await this.pausing;
    await this.music.setDevice(deviceId, playingNow).catch(this.musicError("device change"));
  }

  /** The host quits: stop the music and end the game for everyone. */
  async stop() {
    this.dispose();
    this.paused = false;
    this.endPause();
    this.guesser = undefined;
    this.awaitingNext = false;
    if (this.phase !== "lobby") this.phase = "finished";
    this.onChange();
    await this.pausing;
    await this.music.pause().catch(this.musicError("pause"));
  }

  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.guessTimer);
    clearInterval(this.hintTicker);
  }

  // ---------------------------------------------------------------- state

  /** `forPlayerId`: the player this copy is for. Multiple-choice options are only included for the current guesser. */
  state(forPlayerId?: string): RoomState {
    const players: PlayerPublic[] = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected,
      attemptsLeft: Math.max(0, this.config.attempts - p.attemptsUsed), skipVote: p.skipVote, streak: p.streak,
    }));
    const playing = this.phase === "playing" && this.roundStartedAt !== undefined;
    const g = this.guesser ? this.players.get(this.guesser) : undefined;
    const elapsed = playing ? this.elapsed() : 0;
    const progress = elapsed / this.hintWindowMs;
    // letters only start to appear after a delay, then fill in evenly until the timer ends
    const delay = Math.min(HINT_DELAY_MS, this.hintWindowMs / 2);
    // the hints finish HINT_GRACE_MS after the timer ends (the round is over by then), never before it
    const letterProgress = Math.max(0, (elapsed - delay) / (this.hintWindowMs + HINT_GRACE_MS - delay));

    let hint: RoomState["hint"];
    if (playing && this.config.hints.reveal) {
      hint = {
        title: this.wantTitle ? maskText(this.hintTitle, this.hintOrder.title, revealCount(letterProgress, this.hintOrder.title.length, 1)) : this.hintTitle,
        artist: this.wantArtist ? maskText(this.hintArtist, this.hintOrder.artist, revealCount(letterProgress, this.hintOrder.artist.length, 1)) : this.hintArtist,
      };
    }
    let triviaShown: string[] | undefined;
    if (playing && this.config.hints.trivia && this.current && this.trivia) {
      const facts = this.trivia.peek(this.current);
      triviaShown = facts.slice(0, Math.min(facts.length, Math.floor(Math.min(1, progress) * (facts.length + 1))));
    }
    const art = playing && this.config.hints.art && this.current?.albumArt ? { url: this.current.albumArt, progress: Math.min(0.999, elapsed / (this.hintWindowMs + HINT_GRACE_MS)) } : undefined;
    let options: ChoiceOption[] | undefined;
    if (playing && g && forPlayerId === g.id && this.choices.length > 0) {
      const out = this.eliminated.get(g.id);
      options = this.choices.filter((c) => !out?.has(c.id)).map(({ id, label }) => ({ id, label }));
    }

    return {
      code: this.code,
      youtube: this.youtube || undefined,
      phase: this.phase,
      players,
      round: this.round,
      totalRounds: this.config.playTo.kind === "rounds" ? this.round + this.queue.length : undefined,
      config: this.config,
      roundMs: this.limitMs,
      guessMs: g ? this.guessLimit : this.opts.guessMs,
      maxAttempts: this.config.attempts,
      clock: this.config.playTo.kind === "score" && this.gameStartedAt !== undefined ? { ms: this.gameMs(), running: this.finishMs === undefined && this.pauseStartedAt === undefined && (this.phase === "playing" || this.phase === "reveal") } : undefined,
      highScores: this.phase === "finished" ? this.board : undefined,
      remainingMs: playing && this.limitMs !== null ? Math.max(0, this.limitMs - elapsed) : undefined,
      paused: playing && this.paused ? true : undefined,
      guesser: g ? { id: g.id, name: g.name } : undefined,
      guessRemainingMs: g ? Math.max(0, this.guessLimit - (this.now() - this.guessStartedAt)) : undefined,
      activePlayerId: this.config.order === "roundRobin" && (playing || this.phase === "reveal") ? this.activeId : undefined,
      hint,
      trivia: triviaShown,
      art,
      options,
      lastScore: playing || this.phase === "reveal" ? this.lastScore : undefined,
      found: this.phase === "playing" ? { ...this.found } : undefined,
      reveal: this.reveal,
      hostConnected: this.hostConnected,
      awaitingNext: this.phase === "reveal" && this.awaitingNext ? true : undefined,
      skip: this.phase === "playing" ? this.skipInfo() : undefined,
    };
  }
}
