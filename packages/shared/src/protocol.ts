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
  /** "Trivia" hint: facts shown so far this round */
  trivia?: string[];
  /** multiple choice: the options for the guesser only (others never receive them) */
  options?: ChoiceOption[];
  lastScore?: LastScore;
  /** the reveal is held until the host presses Next or the song ends (auto-advance is off) */
  awaitingNext?: boolean;
  /** skip votes this round. Voters = connected players, plus the host if the host is not also playing. */
  skip?: { votes: number; voters: number; host: boolean };
}

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
  /** host: change a game setting */
  | { t: "settings"; autoAdvance?: boolean }
  | { t: "start" }
  /** toggle a skip vote (host and players alike; the song is skipped when every voter has voted) */
  | { t: "skip" }
  | { t: "pause" }
  | { t: "quit" }
  /** host: play the music on another device */
  | { t: "device"; deviceId: string }
  | { t: "next" };

export type ServerMessage =
  | { t: "joined"; playerId: string }
  | { t: "state"; state: RoomState }
  | { t: "result"; title: boolean; artist: boolean; points: number; multipliers: Multiplier[] }
  /** sent once to a player who is about to answer by typing: song titles and artists of the playlist, for auto-completion */
  | { t: "words"; list: string[] }
  | { t: "error"; message: string };
