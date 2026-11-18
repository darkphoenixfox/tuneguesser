import { useEffect, useRef, useState } from "react";
import { PadKeyboard } from "./PadKeyboard";
import { Glyph } from "./Glyph";
import { onPadButton } from "./pad";

/** Gamepad text entry: pressing A on a text box (main screen, lobby) opens the on-screen keyboard for it. */
export function PadTextEntry() {
  const [target, setTarget] = useState<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const live = useRef({ target, text });
  live.current = { target, text };

  useEffect(() => {
    const open = (e: Event) => {
      const el = (e as CustomEvent<HTMLInputElement>).detail;
      setTarget(el);
      setText(el.value);
    };
    window.addEventListener("tg-pad-text", open);
    const off = onPadButton((b) => { if (b === "start" && live.current.target) close(); });
    return () => { window.removeEventListener("tg-pad-text", open); off(); };
  }, []);

  const close = () => { live.current.target?.focus({ preventScroll: true }); setTarget(null); };
  const apply = () => {
    const el = live.current.target;
    if (el) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, live.current.text);
      el.dispatchEvent(new Event("input", { bubbles: true })); // so the app's own onChange runs (it may tidy the text)
    }
    close();
  };
  if (!target) return null;
  const max = target.maxLength > 0 ? target.maxLength : 160;
  const label = target.closest("label")?.firstChild?.textContent?.trim() || target.placeholder || "Type here";
  return (
    <div className="padtext" role="dialog" aria-label="On-screen keyboard" data-pad-game>
      <div className="card">
        <h2>{label}</h2>
        <div className="padtext-value">{text || <span className="muted">…</span>}<i /></div>
        <PadKeyboard text={text} words={[]} onText={(t) => setText(t.slice(0, max))} onSend={apply} sendLabel="done" />
        <button className="btn ghost" onClick={close}>Cancel <Glyph button="start" /></button>
      </div>
    </div>
  );
}
