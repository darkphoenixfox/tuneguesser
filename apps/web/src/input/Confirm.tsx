import { useEffect, useRef, useState } from "react";
import { Glyph } from "./Glyph";
import { onPadMenuButton, setMenuMode, usePad } from "./pad";

/**
 * In-app confirmation (replaces the browser's confirm box so a gamepad can answer it): left/right choose, A confirms the
 * highlighted button, B cancels. While it is open the game ignores the pad.
 */
export function Confirm({ message, confirmLabel, onConfirm, onCancel }: { message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const [sel, setSel] = useState<0 | 1>(0); // starts on Cancel: the safe choice
  const { connected } = usePad();
  const live = useRef({ sel, onConfirm, onCancel });
  live.current = { sel, onConfirm, onCancel };

  useEffect(() => {
    setMenuMode(true); // the pad belongs to this dialog now
    const off = onPadMenuButton((b) => {
      document.documentElement.dataset.pad = "1";
      const h = live.current;
      if (b === "left" || b === "up") setSel(0);
      else if (b === "right" || b === "down") setSel(1);
      else if (b === "a") (h.sel === 1 ? h.onConfirm : h.onCancel)();
      else if (b === "b" || b === "start") h.onCancel();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); live.current.onCancel(); }
      else if (e.key === "ArrowLeft") setSel(0);
      else if (e.key === "ArrowRight") setSel(1);
    };
    window.addEventListener("keydown", onKey);
    return () => { setMenuMode(false); off(); window.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <div className="confirm padtext" role="alertdialog" aria-label={message} data-pad-game>
      <div className="card center">
        <h2>{message}</h2>
        <div className="confirm-actions">
          <button className={"btn ghost" + (sel === 0 ? " pad-sel" : "")} autoFocus onClick={onCancel}>Cancel{connected && <> <Glyph button="b" /></>}</button>
          <button className={"btn" + (sel === 1 ? " pad-sel" : "")} onClick={onConfirm}>{confirmLabel}{connected && sel === 1 && <> <Glyph button="a" /></>}</button>
        </div>
      </div>
    </div>
  );
}
