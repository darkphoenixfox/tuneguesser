import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { suggest } from "@tuneguesser/shared";
import { Glyph } from "./Glyph";
import { onPadButton, type PadButtonName } from "./pad";

const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl'", "zxcvbnm-.&"];
/** The action column on the right, top to bottom */
const ACTIONS: Array<{ id: "send" | "space" | "cancel" | "back"; button: PadButtonName; label: string }> = [
  { id: "send", button: "y", label: "SEND" },
  { id: "space", button: "x", label: "SPACE" },
  { id: "cancel", button: "b", label: "CANCEL" },
  { id: "back", button: "rb", label: "BACKSPACE" },
];
const SUGG = -1;
const ACT = ROWS.length; // position row of the action column

/**
 * On-screen keyboard for gamepads: letter keys (with a row of word suggestions above) and a column of action buttons on the
 * right. D-pad moves (right from the last letter reaches the actions), A presses, and the action buttons have their own
 * gamepad buttons: Y send, X space, B cancel, R1/RB backspace. `children` is shown above the keys (the answer field).
 */
export function PadKeyboard({ text, words, onText, onSend, onCancel, disabled, sendLabel = "SEND", children }: { text: string; words: string[]; onText: (t: string) => void; onSend: () => void; onCancel: () => void; disabled?: boolean; sendLabel?: string; children?: ReactNode }) {
  const sugg = useMemo(() => suggest(text, words), [text, words]);
  const [pos, setPos] = useState({ r: 1, c: 0 });
  const live = useRef({ text, sugg, disabled, pos, onText, onSend, onCancel });
  live.current = { text, sugg, disabled, pos, onText, onSend, onCancel };

  const width = (r: number) => (r === SUGG ? live.current.sugg.length : r === ACT ? ACTIONS.length : ROWS[r]!.length);
  const clamp = (r: number, c: number) => {
    const minR = live.current.sugg.length ? SUGG : 0;
    const rr = Math.min(ACT, Math.max(minR, r));
    return { r: rr, c: Math.min(Math.max(0, c), width(rr) - 1) };
  };

  const act = (id: (typeof ACTIONS)[number]["id"]) => {
    const h = live.current;
    if (id === "cancel") return h.onCancel();
    if (h.disabled) return;
    if (id === "send") h.onSend();
    else if (id === "space") h.onText(h.text + " ");
    else h.onText(h.text.slice(0, -1));
  };

  const press = (r: number, c: number) => {
    const h = live.current;
    if (r === ACT) return act(ACTIONS[c]!.id);
    if (h.disabled) return;
    if (r === SUGG) {
      const s = h.sugg[c];
      if (s) { h.onText(s.text.slice(0, 160)); setPos({ r: SUGG, c: 0 }); }
    } else h.onText((h.text + ROWS[r]![c]!).slice(0, 160));
  };

  useEffect(() => { setPos((p) => clamp(p.r, p.c)); }, [sugg.length]);

  useEffect(() => onPadButton((b) => {
    const h = live.current;
    const { r, c } = clamp(h.pos.r, h.pos.c);
    const last = ROWS[0]!.length - 1;
    if (b === "up") setPos(r === ACT ? { r, c: Math.max(0, c - 1) } : clamp(r - 1, c));
    else if (b === "down") setPos(r === ACT ? { r, c: Math.min(ACTIONS.length - 1, c + 1) } : r === SUGG ? clamp(0, c) : { r: Math.min(ROWS.length - 1, r + 1), c });
    else if (b === "left") setPos(r === ACT ? { r: Math.min(ROWS.length - 1, c), c: last } : { r, c: (c + width(r) - 1) % width(r) });
    else if (b === "right") setPos(r === ACT ? { r, c } : r === SUGG ? { r, c: (c + 1) % width(r) } : c === last ? { r: ACT, c: Math.min(r, ACTIONS.length - 1) } : { r, c: c + 1 });
    else if (b === "a") press(r, c);
    else { const a = ACTIONS.find((x) => x.button === b); if (a) act(a.id); }
  }), []);

  const cur = clamp(pos.r, pos.c);
  const cls = (r: number, c: number) => "pk-key" + (cur.r === r && cur.c === c ? " on" : "");
  return (
    <div className="padkb" aria-label="On-screen keyboard">
      <div className="pk-left">
        {children}
        <div className="pk-row pk-sugg">
          {sugg.length === 0 && <span className="muted pk-none">Suggestions appear as you type</span>}
          {sugg.map((s, c) => <button type="button" key={s.text} className={cls(SUGG, c) + " sugg"} onClick={() => { setPos({ r: SUGG, c }); press(SUGG, c); }}>{s.label}</button>)}
        </div>
        {ROWS.map((row, r) => (
          <div className="pk-row" key={r}>
            {[...row].map((ch, c) => <button type="button" key={ch} className={cls(r, c)} onClick={() => { setPos({ r, c }); press(r, c); }}>{ch}</button>)}
          </div>
        ))}
      </div>
      <div className="pk-actions">
        {ACTIONS.map((a, i) => (
          <button type="button" key={a.id} className={cls(ACT, i) + " act" + (a.id === "send" ? " send" : "")} onClick={() => { setPos({ r: ACT, c: i }); press(ACT, i); }}>
            <Glyph button={a.button} /> {a.id === "send" ? sendLabel : a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
