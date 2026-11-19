import { useCallback, useEffect, useRef } from "react";
import type { PlayerCommand } from "@tuneguesser/shared";

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

/** Block counts across the picture, from coarse to sharp (same idea as the artwork hint). */
const STEPS = [3, 4, 6, 8, 12, 16, 24, 32, 48];

/** Invisible SVG filter that turns whatever it is applied to (even a video) into big blocks. */
function ensureFilter(): SVGFilterElement {
  let f = document.getElementById("tg-pixelate") as SVGFilterElement | null;
  if (f) return f;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.style.position = "absolute";
  svg.innerHTML = `<filter id="tg-pixelate" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feFlood x="1" y="1" width="1" height="1" /><feComposite width="2" height="2" /><feTile result="tiles" />
    <feComposite in="SourceGraphic" in2="tiles" operator="in" /><feMorphology operator="dilate" radius="1" /></filter>`;
  document.body.appendChild(svg);
  return svg.firstElementChild as SVGFilterElement;
}
function setBlock(px: number) {
  const f = ensureFilter();
  const [flood, comp, , , morph] = Array.from(f.children) as SVGElement[];
  flood!.setAttribute("x", String(px / 2)); flood!.setAttribute("y", String(px / 2));
  comp!.setAttribute("width", String(px)); comp!.setAttribute("height", String(px));
  morph!.setAttribute("radius", String(Math.max(1, Math.ceil(px / 2))));
}

let apiReady: Promise<void> | undefined;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return (apiReady ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }));
}

/**
 * YouTube mode: the music plays here, in YouTube's embedded player on the host screen. The server sends the commands.
 * Returns `run`, to be called for every {t:"player"} message, and a small element to render somewhere in the page.
 */
export function useYouTubePlayer(enabled: boolean, onError: (message: string) => void) {
  const player = useRef<any>(null);
  const queue = useRef<PlayerCommand[]>([]);
  const err = useRef(onError);
  err.current = onError;
  const box = useRef<HTMLDivElement | null>(null);
  /** where to show the picture (the artwork hint), with how sharp it is: null = hidden, sound only */
  const target = useRef<{ el: HTMLElement; progress: number } | null>(null);
  const follow = useCallback((el: HTMLElement | null, progress = 0) => { target.current = el ? { el, progress } : null; }, []);

  const apply = useCallback((p: any, c: PlayerCommand) => {
    if (c.op === "play") p.loadVideoById({ videoId: c.videoId, startSeconds: c.startMs / 1000 });
    else if (c.op === "resume") {
      const cur = p.getVideoData?.().video_id;
      if (cur === c.videoId) p.playVideo(); else p.loadVideoById({ videoId: c.videoId, startSeconds: c.positionMs / 1000 });
    } else if (c.op === "pause") p.pauseVideo();
    else p.stopVideo();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    // the player lives in its own element on the page body, so it does not depend on what the screen is rendering at that moment
    const el = document.createElement("div");
    el.className = "yt-player";
    el.setAttribute("aria-hidden", "true");
    const mount = document.createElement("div");
    el.appendChild(mount);
    document.body.appendChild(el);
    box.current = el;
    // keep the player on top of the artwork slot (if there is one) and pixelate it
    let raf = 0;
    const place = () => {
      const t = target.current;
      if (t && t.el.isConnected) {
        const r = t.el.getBoundingClientRect();
        el.classList.add("shown");
        Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        const n = t.progress >= 1 ? 0 : STEPS[Math.min(STEPS.length - 1, Math.floor(Math.max(0, t.progress) * STEPS.length))]!;
        if (n) { setBlock(Math.max(2, r.width / n)); el.style.filter = "url(#tg-pixelate)"; } else el.style.filter = "none";
      } else if (el.classList.contains("shown")) {
        el.classList.remove("shown");
        Object.assign(el.style, { left: "", top: "", width: "", height: "", filter: "" });
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    let blocked = false;
    const unblock = () => { if (blocked) { blocked = false; try { player.current?.playVideo(); } catch { /* not ready */ } } };
    document.addEventListener("pointerdown", unblock);
    document.addEventListener("keydown", unblock);
    void loadApi().then(() => {
      if (dead) return;
      player.current = new window.YT.Player(mount, {
        width: "100%", height: "100%",
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => { for (const c of queue.current.splice(0)) apply(player.current, c); },
          onAutoplayBlocked: () => { blocked = true; err.current("The browser blocked the sound: tap anywhere to start the music"); },
          onError: (e: { data: number }) => err.current(e.data === 101 || e.data === 150 ? "This video cannot be played embedded" : `YouTube player error ${e.data}`),
        },
      });
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", unblock);
      document.removeEventListener("keydown", unblock);
      try { player.current?.destroy?.(); } catch { /* already gone */ }
      player.current = null;
      el.remove();
      box.current = null;
    };
  }, [enabled, apply]);

  const run = useCallback((c: PlayerCommand) => {
    if (player.current?.loadVideoById) apply(player.current, c); else queue.current.push(c);
  }, [apply]);

  return { run, follow, element: null as null };
}
