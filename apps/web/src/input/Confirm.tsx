import { useEffect, useRef } from "react";
import { Glyph } from "./Glyph";
import { onPadMenuButton, setMenuMode, usePad } from "./pad";

/**
 * In-app confirmation (replaces the browser's confirm box so a gamepad can answer it): A confirms, B goes back.
 * While it is open the game ignores the pad.
 */
export function Confirm({ message, confirmLabel, cancelLabel = "Back to game", onConfirm, onCancel }: { message: string; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  const { connected } = usePad();
  const live = useRef({ onConfirm, onCancel });
  live.current = { onConfirm, onCancel };

  useEffect(() => {
    setMenuMode(true); // the pad belongs to this dialog now
    const off = onPadMenuButton((b) => {
      document.documentElement.dataset.pad = "1";
      if (b === "a") live.current.onConfirm();
      else if (b === "b" || b === "start") live.current.onCancel();
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); live.current.onCancel(); } };
    window.addEventListener("keydown", onKey);
    return () => { setMenuMode(false); off(); window.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <div className="confirm padtext" role="alertdialog" aria-label={message}>
      <div className="card center">
        <h2>{message}</h2>
        <div className="confirm-actions">
          <button className="btn" onClick={onConfirm}>{confirmLabel}{connected && <> <Glyph button="a" /></>}</button>
          <button className="btn ghost" autoFocus onClick={onCancel}>{cancelLabel}{connected && <> <Glyph button="b" /></>}</button>
        </div>
      </div>
    </div>
  );
}
