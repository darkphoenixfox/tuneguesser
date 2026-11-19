/**
 * Room codes encode which server slot ("a" or "b", blue/green deploys) owns the room: the first letter is in A–M for slot a
 * and N–Z for slot b, so the reverse proxy can send a room's WebSocket to the right server without any lookup.
 * Without a slot (dev, tests) any letter is allowed.
 */
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion with 1/0
const HALF = CODE_CHARS.length / 2;

export function makeRoomCode(slot: string | undefined, rand: () => number = Math.random): string {
  const pool = slot === "a" ? CODE_CHARS.slice(0, HALF) : slot === "b" ? CODE_CHARS.slice(HALF) : CODE_CHARS;
  const pick = (chars: string) => chars[Math.floor(rand() * chars.length)]!;
  return pick(pool) + Array.from({ length: 3 }, () => pick(CODE_CHARS)).join("");
}

export function slotOfCode(code: string): "a" | "b" | undefined {
  const i = CODE_CHARS.indexOf(code.toUpperCase()[0] ?? "");
  return i < 0 ? undefined : i < HALF ? "a" : "b";
}
