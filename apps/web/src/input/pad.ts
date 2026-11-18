import { useSyncExternalStore } from "react";

/** Gamepad input: polls the Gamepad API while a pad is connected and emits one event per button press. Standard mapping. */
export type PadButtonName = "a" | "b" | "x" | "y" | "lb" | "rb" | "start" | "select" | "up" | "down" | "left" | "right";
const NAMES: Record<number, PadButtonName> = { 0: "a", 1: "b", 2: "x", 3: "y", 4: "lb", 5: "rb", 8: "select", 9: "start", 12: "up", 13: "down", 14: "left", 15: "right" };

export type PadLayout = "xbox" | "ps";
export const layoutOf = (id: string): PadLayout => (/playstation|dualshock|dualsense|054c|sony/i.test(id) ? "ps" : "xbox");

interface Snap { connected: boolean; layout: PadLayout }
let snap: Snap = { connected: false, layout: "xbox" };
const store = new Set<() => void>();
const listeners = new Set<(b: PadButtonName) => void>();
let raf = 0;
let down = new Set<number>();
const nextAt = new Map<number, number>();

const set = (n: Snap) => {
  if (n.connected === snap.connected && n.layout === snap.layout) return;
  snap = n;
  store.forEach((l) => l());
};

function pads(): Gamepad[] {
  try { return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p && p.connected); } catch { return []; }
}

function poll() {
  const list = pads();
  if (list.length === 0) { raf = 0; down = new Set(); set({ connected: false, layout: snap.layout }); return; }
  set({ connected: true, layout: layoutOf(list[0]!.id) });
  const now = performance.now();
  const cur = new Set<number>();
  for (const p of list) p.buttons.forEach((b, i) => { if (b.pressed && NAMES[i]) cur.add(i); });
  for (const i of cur) {
    const dir = i >= 12; // d-pad repeats while held
    if (!down.has(i)) { nextAt.set(i, now + 380); listeners.forEach((l) => l(NAMES[i]!)); }
    else if (dir && now >= (nextAt.get(i) ?? Infinity)) { nextAt.set(i, now + 120); listeners.forEach((l) => l(NAMES[i]!)); }
  }
  down = cur;
  raf = requestAnimationFrame(poll);
}

function start() {
  if (raf || typeof window === "undefined") return;
  raf = requestAnimationFrame(poll);
}

if (typeof window !== "undefined") {
  window.addEventListener("gamepadconnected", start);
  window.addEventListener("gamepaddisconnected", () => start());
  if (pads().length) start();
}

export const usePad = (): Snap => useSyncExternalStore((cb) => { store.add(cb); return () => void store.delete(cb); }, () => snap);
export const onPadButton = (l: (b: PadButtonName) => void) => { listeners.add(l); return () => void listeners.delete(l); };
