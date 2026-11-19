import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomState, ServerMessage } from "@tuneguesser/shared";

/** Connects to the room socket, keeps the latest state, reconnects when dropped. */
export function useRoom(first: ClientMessage | null, onMessage?: (m: ServerMessage) => void) {
  const [state, setState] = useState<RoomState>();
  const [error, setError] = useState<string>();
  const [connected, setConnected] = useState(false);
  /** wall-clock time (this device) when the current round ends */
  const [endsAt, setEndsAt] = useState(0);
  /** wall-clock time when the current guesser runs out of time to answer */
  const [guessEndsAt, setGuessEndsAt] = useState(0);
  const ws = useRef<WebSocket>();
  const cb = useRef(onMessage);
  cb.current = onMessage;
  const firstKey = JSON.stringify(first);

  useEffect(() => {
    if (!first) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      // ?room=CODE lets the proxy send the socket to the server that owns the room (blue/green deploys)
      const code = "code" in first ? encodeURIComponent(String(first.code)) : "";
      const s = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws${code ? `?room=${code}` : ""}`);
      ws.current = s;
      s.onopen = () => { setConnected(true); setError(undefined); s.send(JSON.stringify(first)); };
      s.onmessage = (e) => {
        const m: ServerMessage = JSON.parse(e.data);
        if (m.t === "state") {
          setState(m.state);
          setEndsAt(m.state.remainingMs !== undefined && !m.state.guesser && !m.state.paused ? Date.now() + m.state.remainingMs : 0);
          setGuessEndsAt(m.state.guessRemainingMs !== undefined ? Date.now() + m.state.guessRemainingMs : 0);
        } else if (m.t === "error") { setError(m.message); setTimeout(() => setError((cur) => (cur === m.message ? undefined : cur)), 7000); }
        cb.current?.(m);
      };
      s.onclose = () => { setConnected(false); if (!closed) retry = setTimeout(open, 1500); };
    };
    open();
    return () => { closed = true; clearTimeout(retry); ws.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey]);

  const send = useCallback((m: ClientMessage) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(m)), []);
  return { state, error, connected, endsAt, guessEndsAt, send };
}

/** Remaining seconds (fractional), re-rendering ~10x/s while a round is running */
export function useCountdown(endsAt: number, frozenMs?: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, [endsAt]);
  if (frozenMs !== undefined) return frozenMs / 1000; // paused: show the frozen value
  return endsAt ? Math.max(0, (endsAt - now) / 1000) : 0;
}

/** Start at the top of the page whenever the screen changes (joining, creating a room, a new phase). */
export function useScrollTop(key: unknown) {
  useEffect(() => { window.scrollTo(0, 0); }, [key]);
}
