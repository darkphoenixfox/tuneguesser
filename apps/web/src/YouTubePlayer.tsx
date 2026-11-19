import { useCallback, useEffect, useRef } from "react";
import type { PlayerCommand } from "@tuneguesser/shared";

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
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
    const box = document.createElement("div");
    box.className = "yt-player";
    box.setAttribute("aria-hidden", "true");
    const mount = document.createElement("div");
    box.appendChild(mount);
    document.body.appendChild(box);
    let blocked = false;
    const unblock = () => { if (blocked) { blocked = false; try { player.current?.playVideo(); } catch { /* not ready */ } } };
    document.addEventListener("pointerdown", unblock);
    document.addEventListener("keydown", unblock);
    void loadApi().then(() => {
      if (dead) return;
      player.current = new window.YT.Player(mount, {
        width: "200", height: "200", // YouTube wants at least 200x200
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
      document.removeEventListener("pointerdown", unblock);
      document.removeEventListener("keydown", unblock);
      try { player.current?.destroy?.(); } catch { /* already gone */ }
      player.current = null;
      box.remove();
    };
  }, [enabled, apply]);

  const run = useCallback((c: PlayerCommand) => {
    if (player.current?.loadVideoById) apply(player.current, c); else queue.current.push(c);
  }, [apply]);

  return { run, element: null as null };
}
