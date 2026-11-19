import { useEffect, useState } from "react";
import { t } from "./i18n";
import { Confirm } from "./input/Confirm";

type AppBridge = { quit?: () => void };
const bridge = () => (window as unknown as { TuneGuesserApp?: AppBridge }).TuneGuesserApp;

const click = (sel: string) => { const el = document.querySelector<HTMLElement>(sel); el?.click(); return !!el; };

/**
 * Android app: the Back button must not close the app by itself. The app's web view goes "back" in the page history, so we keep one
 * extra history entry and, on every Back, act on the screen instead: close what is open, ask before leaving a game, and only then
 * offer to exit the app.
 */
export function BackHandler() {
  const [askExit, setAskExit] = useState(false);

  useEffect(() => {
    if (!bridge()) return; // normal browsers keep their own Back
    const arm = () => history.pushState({ tg: Date.now() }, "");
    arm();
    const onBack = () => {
      arm(); // stay on this page for the next Back
      if (document.querySelector(".confirm")) { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); return; }
      if (click(".pairing-overlay .btn.ghost")) return;
      if (click(".settings .btn.ghost:last-of-type")) return;
      if (document.querySelector("[data-pad-game], .screen.game, .screen.phone")) {
        // in a room: the screen's own quit / exit button asks for confirmation during a game
        if (click(".screen.game .quit") || click(".screen.phone .exit")) return;
      }
      setAskExit(true);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  if (!askExit) return null;
  return <Confirm message={t("Exit TuneGuesser?")} confirmLabel={t("Exit")} cancelLabel={t("Stay")} onCancel={() => setAskExit(false)} onConfirm={() => { setAskExit(false); bridge()?.quit?.(); }} />;
}
