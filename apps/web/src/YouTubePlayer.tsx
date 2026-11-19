import { useCallback, useEffect, useRef } from "react";
import type { PlayerCommand } from "@tuneguesser/shared";
import { t } from "./i18n";

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

/**
 * How blurred/blocky the picture is as the hint progresses (0..1): coarse mosaics first, then a blur that clears up.
 * (SVG filters do not work on YouTube's cross-origin frame, so the mosaic is a grid of backdrop-filter tiles over it.)
 */
const STAGES: Array<{ cols: number } | { blur: number }> = [{ cols: 3 }, { cols: 4 }, { cols: 6 }, { cols: 8 }, { blur: 10 }, { blur: 6 }, { blur: 3 }];

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
    const mosaic = document.createElement("div");
    mosaic.className = "yt-mosaic";
    el.appendChild(mosaic);
    let mosaicKey = "";
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
        const stage = t.progress >= 1 ? null : STAGES[Math.min(STAGES.length - 1, Math.floor(Math.max(0, t.progress) * STAGES.length))]!;
        const cols = stage && "cols" in stage ? stage.cols : 0;
        const rows = Math.max(1, Math.round(cols * 9 / 16));
        const key = `${cols}x${rows}:${Math.round(r.width)}`;
        if (key !== mosaicKey) {
          mosaicKey = key;
          mosaic.textContent = "";
          if (cols) {
            mosaic.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            mosaic.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
            const blur = `blur(${Math.max(8, Math.round(r.width / cols * 0.6))}px)`; // about the size of a cell: each tile shows the average colour of its square
            for (let i = 0; i < cols * rows; i++) { const c = document.createElement("i"); c.style.backdropFilter = blur; c.style.setProperty("-webkit-backdrop-filter", blur); mosaic.appendChild(c); }
          }
        }
        el.style.setProperty("--yt-blur", stage && "blur" in stage ? `${stage.blur}px` : "0px");
      } else if (el.classList.contains("shown")) {
        el.classList.remove("shown");
        Object.assign(el.style, { left: "", top: "", width: "", height: "" });
        mosaic.textContent = ""; mosaicKey = "";
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
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, cc_load_policy: 0, iv_load_policy: 3, fs: 0, rel: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => { try { player.current?.unloadModule?.("captions"); player.current?.unloadModule?.("cc"); } catch { /* optional */ } for (const c of queue.current.splice(0)) apply(player.current, c); },
          onAutoplayBlocked: () => { blocked = true; err.current(t("The browser blocked the sound: tap anywhere to start the music")); },
          onError: (e: { data: number }) => err.current(e.data === 101 || e.data === 150 ? t("This video cannot be played embedded") : t("YouTube player error {n}", { n: e.data })),
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
