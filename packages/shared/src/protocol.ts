import type { GameConfig } from "./config";
import type { Multiplier } from "./scoring";

/** Messages between server, host screen and phone controllers (JSON over WebSocket). */

export type Phase = "lobby" | "playing" | "reveal" | "finished";

export interface PlayerPublic {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** wrong or timed-out answers left this round (a guess with a correct part is free) */
  attemptsLeft: number;
  /** wants to skip this song (the song is skipped when every connected player does) */
  skipVote: boolean;
  /** consecutive rounds in which this player scored */
  streak: number;
}

/** Parts of the song found so far this round, shown to everyone while the music continues. */
export interface Found {
  title?: { text: string; by: string };
  artist?: { text: string; by: string };
}

/** Last scoring answer, with the multipliers that applied (shown to everyone). */
export interface LastScore {
  name: string;
  points: number;
  multipliers: Multiplier[];
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface RevealInfo {
  title: string;
  artists: string[];
  albumArt?: string;
  year?: string;
  /** points earned this round per player id */
  gains: Record<string, { title: number; artist: number }>;
}

/** One saved result in a high-score table. */
export interface HighScoreEntry {
  id: string;
  name: string;
  /** points */
  score: number;
  /** playing to a target score: how long it took to get there */
  timeMs?: number;
  /** epoch ms */
  at: number;
}

/** The table for games with exactly these settings (same playlists, scoring, hints, timer, answers, start, attempts, multipliers). */
export interface HighScores {
  kind: "rounds" | "score";
  /** best first: most points (rounds) or the fastest time (target score) */
  entries: HighScoreEntry[];
  /** ids of the entries that this game just added */
  mine: string[];
}

export interface RoomState {
  code: string;
  phase: Phase;
  players: PlayerPublic[];
  round: number;
  /** undefined when playing to a target score */
  totalRounds?: number;
  config: GameConfig;
  /** unlimited timer: null */
  roundMs: number | null;
  guessMs: number;
  maxAttempts: number;
  /** ms left in the round. While someone is guessing the clock is frozen at this value. */
  remainingMs?: number;
  /** the player who pressed ANSWER: music and round clock are stopped while they type */
  /** the host or a player paused the game: music and clock are stopped */
  paused?: boolean;
  guesser?: { id: string; name: string };
  /** ms the guesser has left to send an answer */
  guessRemainingMs?: number;
  found?: Found;
  reveal?: RevealInfo;
  hostConnected: boolean;
  /** round robin: whose song this is */
  activePlayerId?: string;
  /** "Reveal" hint: the title and artist with unrevealed letters as _ */
  hint?: { title: string; artist: string };
  /** "Artwork" hint: the cover to show pixelated; progress 0 (blocky) .. 1 (sharp) */
  art?: { url: string; progress: number };
  /** "Trivia" hint: facts shown so far this round */
  trivia?: string[];
  /** multiple choice: the options for the guesser only (others never receive them) */
  options?: ChoiceOption[];
  lastScore?: LastScore;
  /** the reveal is held until the host presses Next or the song ends (auto-advance is off) */
  awaitingNext?: boolean;
  /** skip votes this round. Voters = connected players (the host is not a voter unless it plays). */
  skip?: { votes: number; voters: number; host: boolean };
  /** playing to a target score: the game clock (excludes pauses). `running`: add the time since the state was sent. */
  clock?: { ms: number; running: boolean };
  /** after the game: the high-score table for these settings */
  highScores?: HighScores;
  /** YouTube mode: players can choose to hear the music on their own device too */
  youtube?: boolean;
}

/** Players in one room, and how many of them can play on the host's own screen. */
export const MAX_PLAYERS = 8;
export const MAX_LOCAL_PLAYERS = 4;

export type ClientMessage =
  /** hostToken: set when the host joins as a player from the host screen (the host still counts as one voter) */
  | { t: "join"; code: string; name: string; playerId?: string; hostToken?: string }
  | { t: "host"; code: string; token: string }
  /** press the ANSWER button */
  | { t: "buzz" }
  /** the buzzed player's answer */
  | { t: "answer"; text: string }
  /** multiple choice: pick an option */
  | { t: "choose"; optionId: string }
  /** a player exits to the main screen */
  | { t: "leave" }
  /** host, in the lobby: a player on the host screen leaves */
  | { t: "leaveLocal"; playerId: string }
  /** host: change a game setting */
  | { t: "settings"; autoAdvance?: boolean }
  /** player (YouTube mode): also play the music on this device */
  | { t: "listen"; on: boolean }
  /** thumbs up (1) / down (-1) / take back (0) for the song of the current round; `voter` is this browser's anonymous id */
  | { t: "vote"; v: 1 | -1 | 0; voter: string }
  /** host screen (YouTube): the embedded player cannot play this video (removed, private or embedding disabled) */
  | { t: "unplayable"; id: string }
  | { t: "start" }
  /** toggle a skip vote (host and players alike; the song is skipped when every voter has voted) */
  | { t: "skip" }
  | { t: "pause" }
  /** the player who pressed ANSWER gives up this turn (no attempt used; the music continues) */
  | { t: "cancel" }
  /** this player is using the gamepad's on-screen keyboard: give them more time to answer */
  | { t: "padkb"; on: boolean }
  | { t: "quit" }
  /** host: play the music on another device */
  | { t: "device"; deviceId: string }
  | { t: "next" };

/** YouTube mode: what the host screen's embedded player has to do. */
export type PlayerCommand =
  | { op: "play"; videoId: string; startMs: number }
  | { op: "pause" }
  | { op: "resume"; videoId: string; positionMs: number }
  | { op: "stop" };

export type ServerMessage =
  /** host screen only (YouTube mode) */
  | { t: "player"; cmd: PlayerCommand }
  | { t: "joined"; playerId: string }
  /** the host rejected this song ("This song has issues"): the host's device remembers it as banned */
  | { t: "banned"; id: string; name: string }
  | { t: "state"; state: RoomState }
  | { t: "result"; title: boolean; artist: boolean; points: number; multipliers: Multiplier[] }
  /** sent once to a player who is about to answer by typing: song titles and artists of the playlist, for auto-completion */
  | { t: "words"; list: string[] }
  | { t: "error"; message: string };
