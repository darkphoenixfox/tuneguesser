import { useEffect, useRef, useState } from "react";
import { Glyph } from "./Glyph";
import { onPadButton } from "./pad";

const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl'", "zxcvbnm-.&"];
/** Special keys on the last row */
const SPECIAL = ["space", "back", "send"] as const;

/** On-screen keyboard for gamepads: d-pad moves, A types the key, B deletes, X adds a space, Y sends. Tap works too. */
export function PadKeyboard({ onType, onBack, onSend, disabled }: { onType: (c: string) => void; onBack: () => void; onSend: () => void; disabled?: boolean }) {
  const [pos, setPos] = useState({ r: 1, c: 0 });
  const cb = useRef({ onType, onBack, onSend, disabled, pos });
  cb.current = { onType, onBack, onSend, disabled, pos };

  const press = (r: number, c: number) => {
    const h = cb.current;
    if (h.disabled) return;
    if (r < ROWS.length) h.onType(ROWS[r]![c]!);
    else {
      const k = SPECIAL[c]!;
      if (k === "space") h.onType(" "); else if (k === "back") h.onBack(); else h.onSend();
    }
  };

  useEffect(() => onPadButton((b) => {
    const h = cb.current;
    const { r, c } = h.pos;
    const width = (row: number) => (row < ROWS.length ? ROWS[row]!.length : SPECIAL.length);
    const clampC = (row: number, col: number) => Math.min(col, width(row) - 1);
    if (b === "up") setPos({ r: Math.max(0, r - 1), c: clampC(Math.max(0, r - 1), c) });
    else if (b === "down") setPos({ r: Math.min(ROWS.length, r + 1), c: clampC(Math.min(ROWS.length, r + 1), c) });
    else if (b === "left") setPos({ r, c: (c + width(r) - 1) % width(r) });
    else if (b === "right") setPos({ r, c: (c + 1) % width(r) });
    else if (b === "a") press(r, c);
    else if (b === "b" && !h.disabled) h.onBack();
    else if (b === "x" && !h.disabled) h.onType(" ");
    else if (b === "y" && !h.disabled) h.onSend();
  }), []);

  const cls = (r: number, c: number) => "pk-key" + (pos.r === r && pos.c === c ? " on" : "");
  return (
    <div className="padkb" aria-label="On-screen keyboard">
      {ROWS.map((row, r) => (
        <div className="pk-row" key={r}>
          {[...row].map((ch, c) => <button type="button" key={ch} className={cls(r, c)} onClick={() => { setPos({ r, c }); press(r, c); }}>{ch}</button>)}
        </div>
      ))}
      <div className="pk-row">
        <button type="button" className={cls(ROWS.length, 0) + " wide"} onClick={() => press(ROWS.length, 0)}><Glyph button="x" /> space</button>
        <button type="button" className={cls(ROWS.length, 1) + " wide"} onClick={() => press(ROWS.length, 1)}><Glyph button="b" /> ⌫</button>
        <button type="button" className={cls(ROWS.length, 2) + " wide send"} onClick={() => press(ROWS.length, 2)}><Glyph button="y" /> send</button>
      </div>
    </div>
  );
}
