/** Messages between server, host screen and phone controllers (JSON over WebSocket). */

export type Phase = "lobby" | "playing" | "reveal" | "finished";

export interface PlayerPublic {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** already used their one attempt this round */
  attempted: boolean;
}

/** Parts of the song found so far this round, shown to everyone while the music continues. */
export interface Found {
  title?: { text: string; by: string };
  artist?: { text: string; by: string };
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
  totalRounds: number;
  roundMs: number;
  guessMs: number;
  /** ms left in the round. While someone is guessing the clock is frozen at this value. */
  remainingMs?: number;
  /** the player who pressed ANSWER: music and round clock are stopped while they type */
  guesser?: { id: string; name: string };
  /** ms the guesser has left to send an answer */
  guessRemainingMs?: number;
  found?: Found;
  reveal?: RevealInfo;
  hostConnected: boolean;
}

export type ClientMessage =
  | { t: "join"; code: string; name: string; playerId?: string }
  | { t: "host"; code: string; token: string }
  /** press the ANSWER button */
  | { t: "buzz" }
  /** the buzzed player's answer */
  | { t: "answer"; title?: string; artist?: string }
  /** a player exits to the main screen */
  | { t: "leave" }
  | { t: "start" }
  | { t: "skip" }
  | { t: "next" };

export type ServerMessage =
  | { t: "joined"; playerId: string }
  | { t: "state"; state: RoomState }
  | { t: "result"; title: boolean; artist: boolean }
  | { t: "error"; message: string };
