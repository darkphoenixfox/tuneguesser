/** Messages between server, host screen and phone controllers (JSON over WebSocket). */

export type Phase = "lobby" | "playing" | "reveal" | "finished";

export interface PlayerPublic {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  /** has submitted an answer this round */
  answered: boolean;
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
  /** server epoch ms when the current round started; clients compute remaining time from it */
  roundStartedAt?: number;
  reveal?: RevealInfo;
  hostConnected: boolean;
}

export type ClientMessage =
  | { t: "join"; code: string; name: string; playerId?: string }
  | { t: "host"; code: string; token: string }
  | { t: "answer"; title?: string; artist?: string }
  | { t: "start" }
  | { t: "skip" }
  | { t: "next" };

export type ServerMessage =
  | { t: "joined"; playerId: string }
  | { t: "state"; state: RoomState }
  | { t: "error"; message: string };
