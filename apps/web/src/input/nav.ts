import { onPadButton, type PadButtonName } from "./pad";

/**
 * Gamepad navigation of ordinary screens (main screen, create-room page, lobby): the d-pad moves the focus to the nearest
 * control in that direction, A presses it, left/right change a number or a drop-down, LB/RB switch tabs.
 * It stays out of the way while a screen marked `data-pad-game` is shown (rounds, the on-screen keyboard), which use the buttons themselves.
 */
const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";

function candidates(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  });
}

const centre = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };

function move(dir: "up" | "down" | "left" | "right") {
  const all = candidates();
  const cur = document.activeElement instanceof HTMLElement && all.includes(document.activeElement) ? document.activeElement : undefined;
  if (!cur) { focus(document.querySelector<HTMLElement>("[data-pad-first]") ?? all[0]); return; }
  const c = centre(cur);
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const o = centre(el);
    const dx = o.x - c.x, dy = o.y - c.y;
    const along = dir === "up" ? -dy : dir === "down" ? dy : dir === "left" ? -dx : dx;
    const across = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
    if (along <= 4) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) focus(best);
}

function focus(el?: HTMLElement) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

/** left/right on a number box or drop-down changes its value */
function adjust(el: HTMLElement, dir: 1 | -1): boolean {
  if (el instanceof HTMLInputElement && el.type === "number") {
    if (dir > 0) el.stepUp(); else el.stepDown();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + dir));
    if (i === el.selectedIndex) return true;
    el.selectedIndex = i;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function onButton(b: PadButtonName) {
  document.documentElement.dataset.pad = "1"; // shows the focus ring
  if (document.querySelector("[data-pad-game]")) return;
  const el = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  if (b === "up" || b === "down") move(b);
  else if (b === "left" || b === "right") {
    if (el && adjust(el, b === "right" ? 1 : -1)) return;
    move(b);
  } else if (b === "a") {
    if (!el || el === document.body) return move("down");
    if (el instanceof HTMLInputElement && /^(text|search|)$/.test(el.type)) window.dispatchEvent(new CustomEvent("tg-pad-text", { detail: el }));
    else if (el instanceof HTMLSelectElement) (el as any).showPicker?.();
    else el.click();
  } else if (b === "lb" || b === "rb") {
    const tabs = [...document.querySelectorAll<HTMLElement>(".tabs button")];
    const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    const next = tabs[i + (b === "rb" ? 1 : -1)];
    if (next) { next.click(); setTimeout(() => focus(document.querySelector<HTMLElement>("[data-pad-first]") ?? undefined), 50); }
  }
}

let started = false;
export function startPadNav() {
  if (started || typeof window === "undefined") return;
  started = true;
  onPadButton(onButton);
  const off = () => { delete document.documentElement.dataset.pad; };
  window.addEventListener("pointerdown", off);
}
