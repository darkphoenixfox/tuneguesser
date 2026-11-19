import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { sanitizeConfig, type ClientMessage, type ServerMessage } from "@tuneguesser/shared";
import { DemoProvider, type MusicProvider } from "./music";
import { Room } from "./room";
import { TriviaCache } from "./trivia";
import { SpotifyClient, SpotifyProvider, authorizeUrl, exchangeCode, newPkce, type Tokens } from "./spotify";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? `http://127.0.0.1:5173/callback`;
/** Where the browser lands after Spotify login */
const APP_URL = new URL(REDIRECT_URI).origin;

interface Session { client?: SpotifyClient; pkce?: ReturnType<typeof newPkce> }
const sessions = new Map<string, Session>();

interface RoomEntry { room: Room; hostToken: string; sockets: Map<WebSocket, string | undefined>; createdAt: number; abandonTimer?: ReturnType<typeof setTimeout> }
const rooms = new Map<string, RoomEntry>();
/** A room whose host screen is gone for this long is ended (otherwise it keeps playing songs on the host's Spotify). */
const HOST_GONE_MS = 60_000;
const hostSockets = new WeakSet<WebSocket>();
const trivia = new TriviaCache();

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion with 1/0
function newCode(): string {
  for (;;) {
    const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
    if (!rooms.has(c)) return c;
  }
}

function getSession(req: IncomingMessage, res: ServerResponse): Session {
  const m = /(?:^|;\s*)tg_sid=([\w-]+)/.exec(req.headers.cookie ?? "");
  let sid = m?.[1];
  if (!sid || !sessions.has(sid)) {
    sid = randomBytes(24).toString("base64url");
    sessions.set(sid, {});
    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    res.setHeader("Set-Cookie", `tg_sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
  }
  return sessions.get(sid)!;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

async function readJson(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += c.length;
    if (size > 10_000) throw new Error("body too large");
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

const send = (ws: WebSocket, m: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

function broadcast(entry: RoomEntry) {
  for (const [ws, pid] of entry.sockets) send(ws, { t: "state", state: entry.room.state(pid) });
}

const http = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const s = getSession(req, res);

    if (url.pathname === "/healthz") { res.end("ok\n"); return; }

    if (url.pathname === "/api/auth/login") {
      if (!CLIENT_ID) return json(res, 500, { error: "SPOTIFY_CLIENT_ID is not configured" });
      s.pkce = newPkce();
      res.writeHead(302, { Location: authorizeUrl(CLIENT_ID, REDIRECT_URI, s.pkce.challenge, s.pkce.state) });
      res.end();
      return;
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!s.pkce || url.searchParams.get("state") !== s.pkce.state || !code) {
        res.writeHead(302, { Location: `${APP_URL}/host?error=auth` });
        return void res.end();
      }
      const tokens: Tokens = await exchangeCode(CLIENT_ID, REDIRECT_URI, code, s.pkce.verifier);
      s.client = new SpotifyClient(CLIENT_ID, tokens);
      s.pkce = undefined;
      res.writeHead(302, { Location: `${APP_URL}/host` });
      return void res.end();
    }

    if (url.pathname === "/api/me") return json(res, 200, { spotify: !!s.client, spotifyConfigured: !!CLIENT_ID });

    if (url.pathname === "/api/playlists") {
      if (!s.client) return json(res, 401, { error: "not logged in" });
      return json(res, 200, await s.client.playlists());
    }

    if (url.pathname === "/api/devices") {
      if (!s.client) return json(res, 401, { error: "not logged in" });
      return json(res, 200, await s.client.devices());
    }

    if (url.pathname === "/api/rooms" && req.method === "POST") {
      const body = await readJson(req);
      let music: MusicProvider;
      if (body.demo) music = new DemoProvider();
      else {
        if (!s.client) return json(res, 401, { error: "not logged in" });
        const ids = (Array.isArray(body.playlistIds) ? body.playlistIds : [body.playlistId]).filter((x: unknown): x is string => typeof x === "string" && /^[\w]+$/.test(x)).slice(0, 10);
        if (!ids.length) return json(res, 400, { error: "pick at least one playlist" });
        music = new SpotifyProvider(s.client, ids, typeof body.deviceId === "string" ? body.deviceId : undefined);
      }
      const code = newCode();
      const room = new Room(code, music, sanitizeConfig(body.config), { guessMs: 25_000, slowGuessMs: 60_000, revealMs: 5000 }, trivia);
      const entry: RoomEntry = { room, hostToken: randomBytes(16).toString("base64url"), sockets: new Map(), createdAt: Date.now() };
      room.onChange = () => broadcast(entry);
      room.onError = (message) => { for (const ws of entry.sockets.keys()) if (hostSockets.has(ws)) send(ws, { t: "error", message }); };
      rooms.set(code, entry);
      return json(res, 200, { code, hostToken: entry.hostToken });
    }

    json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e instanceof Error ? e.message : "server error" });
  }
});

const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 2000 });

wss.on("connection", (ws) => {
  let entry: RoomEntry | undefined;
  let role: "host" | "player" | undefined;
  let playerId: string | undefined;
  let wordsSent = false;

  ws.on("message", async (raw) => {
    let m: ClientMessage;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    try {
      if (!entry) {
        const e = rooms.get(String((m as any).code ?? "").toUpperCase());
        if (!e) return send(ws, { t: "error", message: "Room not found" });
        if (m.t === "host") {
          if (m.token !== e.hostToken) return send(ws, { t: "error", message: "Bad host token" });
          entry = e; role = "host"; hostSockets.add(ws); clearTimeout(e.abandonTimer); e.room.setHostConnected(true);
        } else if (m.t === "join") {
          const id = e.room.addPlayer(String(m.name ?? ""), m.playerId);
          if (!id) return send(ws, { t: "error", message: "Room is full or already started" });
          entry = e; role = "player"; playerId = id;
          if (m.hostToken && m.hostToken === e.hostToken) e.room.markHostPlayer(id); // the host plays too
          send(ws, { t: "joined", playerId: id });
        } else return;
        entry.sockets.set(ws, playerId);
        send(ws, { t: "state", state: entry.room.state(playerId) });
        broadcast(entry);
        return;
      }
      const room = entry.room;
      if (role === "player" && playerId && m.t === "buzz") {
        if (room.buzz(playerId) && !wordsSent && room.state().config.answers === "type") { wordsSent = true; send(ws, { t: "words", list: room.suggestions() }); }
      } else if (role === "player" && playerId && m.t === "skip") {
        room.voteSkip(playerId);
      } else if (role === "player" && playerId && m.t === "padkb") {
        room.setSlowInput(playerId, m.on === true);
      } else if (role === "player" && playerId && m.t === "cancel") {
        await room.cancelGuess(playerId);
      } else if (role === "player" && m.t === "next") {
        if (room.state().phase === "reveal") await room.nextRound(); // the accept key/button moves on after a round
      } else if (role === "player" && m.t === "pause") {
        room.togglePause();
      } else if (role === "player" && playerId && m.t === "leave") {
        room.leave(playerId);
        playerId = undefined;
        entry.sockets.set(ws, undefined);
      } else if (role === "player" && playerId && m.t === "answer") {
        const r = await room.answer(playerId, String(m.text ?? "").slice(0, 160));
        if (r) send(ws, { t: "result", ...r });
      } else if (role === "player" && playerId && m.t === "choose") {
        const r = await room.choose(playerId, String(m.optionId ?? ""));
        if (r) send(ws, { t: "result", ...r });
      } else if (role === "host") {
        if (m.t === "start") await room.start();
        else if (m.t === "settings") room.setSettings({ autoAdvance: typeof m.autoAdvance === "boolean" ? m.autoAdvance : undefined });
        else if (m.t === "skip") room.voteSkipHost();
        else if (m.t === "pause") room.togglePause();
        else if (m.t === "device" && typeof m.deviceId === "string") await room.setDevice(m.deviceId.slice(0, 80));
        else if (m.t === "quit") { await room.stop(); rooms.delete(room.code); }
        else if (m.t === "next" && room.state().phase === "reveal") await room.nextRound();
      }
    } catch (e) {
      send(ws, { t: "error", message: e instanceof Error ? e.message : "error" });
    }
  });

  ws.on("close", () => {
    if (!entry) return;
    entry.sockets.delete(ws);
    if (role === "player" && playerId) entry.room.setConnected(playerId, false);
    if (role === "host" && ![...entry.sockets.keys()].some((s) => hostSockets.has(s))) {
      entry.room.setHostConnected(false);
      const e = entry;
      clearTimeout(e.abandonTimer);
      e.abandonTimer = setTimeout(() => {
        console.log(`room ${e.room.code}: host gone, ending the game`);
        void (e.room.state().phase === "lobby" ? Promise.resolve(e.room.dispose()) : e.room.stop()).finally(() => { if (rooms.get(e.room.code) === e) rooms.delete(e.room.code); });
      }, HOST_GONE_MS);
    }
  });
});

// Drop rooms older than 4 hours (and stop their music)
setInterval(() => {
  for (const [code, e] of rooms) if (Date.now() - e.createdAt > 4 * 3600_000) { void e.room.stop(); rooms.delete(code); }
}, 600_000).unref();

http.listen(PORT, () => console.log(`TuneGuesser server on :${PORT} (redirect ${REDIRECT_URI})`));
