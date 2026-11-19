import { onPadButton, onPadMenuButton, setMenuMode, type PadButtonName } from "./pad";

/**
 * Gamepad navigation of ordinary screens (main screen, create-room page, lobby): the d-pad moves the focus to the nearest
 * control in that direction, A presses it, left/right change a number or a drop-down, LB/RB switch tabs.
 * It stays out of the way while a screen marked `data-pad-game` is shown (rounds, the on-screen keyboard), which use the buttons themselves.
 */
const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";

function candidates(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  });
}

const centre = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };

function move(dir: "up" | "down" | "left" | "right", root: ParentNode = document) {
  const all = candidates(root);
  const cur = document.activeElement instanceof HTMLElement && all.includes(document.activeElement) ? document.activeElement : undefined;
  if (!cur) {
    // the main action first (Quickstart, Start game, ANSWER), never the corner buttons (mute, settings, quit, device, theme)
    const main = all.find((e) => !e.matches(".mute, .micbtn, .gear, .quit, .devbtn, .theme-btn, .tabs button"));
    focus(document.querySelector<HTMLElement>("[data-pad-first]") ?? main ?? all[0]);
    return;
  }
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

/** The corner buttons (mute, device, settings, quit), left to right. */
const toolbar = () => [...document.querySelectorAll<HTMLElement>(".mute, .micbtn, .devbtn, .gear, .quit")].filter((e) => e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

function enterMenu() {
  const items = toolbar();
  if (!items.length) return false;
  setMenuMode(true);
  focus(items[0]);
  return true;
}
function exitMenu() {
  setMenuMode(false);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Buttons while the corner menu is active: left/right between the corner buttons, an open panel is navigated like a menu. */
function onMenuButton(b: PadButtonName) {
  if (document.querySelector(".confirm")) return; // a confirmation dialog has the pad
  document.documentElement.dataset.pad = "1";
  const panel = document.querySelector<HTMLElement>(".settings");
  const el = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  if (b === "lb" || b === "select" || b === "b") {
    if (panel) { panel.querySelector<HTMLElement>(".btn.ghost:last-of-type")?.click(); setTimeout(() => focus(toolbar().find((t) => t.matches(".gear, .devbtn")) ?? toolbar()[0]), 50); if (b === "b") return; }
    return exitMenu();
  }
  if (panel) {
    if (b === "up" || b === "down" || b === "left" || b === "right") {
      if ((b === "left" || b === "right") && el && adjust(el, b === "right" ? 1 : -1)) return;
      if (!panel.contains(el ?? null)) return focus(candidates(panel)[0]);
      move(b === "left" ? "up" : b === "right" ? "down" : b, panel);
    } else if (b === "a") {
      if (!panel.contains(el ?? null)) return focus(candidates(panel)[0]);
      el?.click();
    }
    return;
  }
  const items = toolbar();
  const i = el ? items.indexOf(el) : -1;
  if (b === "left") focus(items[Math.max(0, i - 1)]);
  else if (b === "right") focus(items[Math.min(items.length - 1, i + 1)]);
  else if (b === "a" && el) {
    el.click();
    setTimeout(() => { const pn = document.querySelector<HTMLElement>(".settings"); if (pn) focus(candidates(pn)[0]); else if (!document.querySelector(".confirm")) exitMenu(); }, 120); // a panel opened: go into it; otherwise (mute, quit) back to the game
  }
}

function onButton(b: PadButtonName) {
  document.documentElement.dataset.pad = "1"; // shows the focus ring
  const inGame = !!document.querySelector("[data-pad-game]");
  const hasTabs = !!document.querySelector(".tabs");
  // the corner menu: LB in a game or a screen without tabs, Select on menu screens
  if ((b === "lb" && (inGame || !hasTabs)) || (b === "select" && !inGame)) { if (enterMenu()) return; }
  if (inGame) return;
  const el = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  if (b === "y") {
    // Y = Quickstart wherever it is on the page
    const q = document.querySelector<HTMLButtonElement>("[data-pad-quick]");
    if (q && !q.disabled) q.click();
  } else if (b === "up" || b === "down") move(b);
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
  onPadMenuButton(onMenuButton);
  const off = () => { delete document.documentElement.dataset.pad; };
  window.addEventListener("pointerdown", off);
}
