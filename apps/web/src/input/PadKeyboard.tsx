import { useEffect, useMemo, useRef, useState } from "react";
import { suggest } from "@tuneguesser/shared";
import { Glyph } from "./Glyph";
import { onPadButton } from "./pad";

const ROWS = ["1234567890", "qwertyuiop", "asdfghjkl'", "zxcvbnm-.&"];
const SPECIAL = ["space", "back", "send"] as const;

/**
 * On-screen keyboard for gamepads, with auto-completion: the top row offers whole titles/artists and words from the
 * playlist. D-pad moves (up from the letters reaches the suggestions), A types / picks, B deletes, X adds a space, Y sends.
 */
export function PadKeyboard({ text, words, onText, onSend, disabled }: { text: string; words: string[]; onText: (t: string) => void; onSend: () => void; disabled?: boolean }) {
  const sugg = useMemo(() => suggest(text, words), [text, words]);
  // r = -1 is the suggestion row, 0..ROWS.length-1 the letter rows, ROWS.length the space/back/send row
  const [pos, setPos] = useState({ r: 1, c: 0 });
  const live = useRef({ text, sugg, disabled, pos, onText, onSend });
  live.current = { text, sugg, disabled, pos, onText, onSend };

  const width = (r: number) => (r === -1 ? live.current.sugg.length : r < ROWS.length ? ROWS[r]!.length : SPECIAL.length);
  const clamp = (r: number, c: number) => {
    const minR = live.current.sugg.length ? -1 : 0;
    const rr = Math.min(ROWS.length, Math.max(minR, r));
    return { r: rr, c: Math.min(Math.max(0, c), width(rr) - 1) };
  };

  const press = (r: number, c: number) => {
    const h = live.current;
    if (h.disabled) return;
    if (r === -1) {
      const s = h.sugg[c];
      if (s) { h.onText(s.text.slice(0, 160)); setPos({ r: -1, c: 0 }); }
    } else if (r < ROWS.length) h.onText((h.text + ROWS[r]![c]!).slice(0, 160));
    else {
      const k = SPECIAL[c]!;
      if (k === "space") h.onText(h.text + " "); else if (k === "back") h.onText(h.text.slice(0, -1)); else h.onSend();
    }
  };

  // the suggestions come and go as the text changes
  useEffect(() => { setPos((p) => clamp(p.r, p.c)); }, [sugg.length]);

  useEffect(() => onPadButton((b) => {
    const h = live.current;
    const { r, c } = clamp(h.pos.r, h.pos.c);
    if (b === "up") setPos(clamp(r - 1, c));
    else if (b === "down") setPos(clamp(r + 1, c));
    else if (b === "left") setPos({ r, c: (c + width(r) - 1) % width(r) });
    else if (b === "right") setPos({ r, c: (c + 1) % width(r) });
    else if (b === "a") press(r, c);
    else if (b === "b" && !h.disabled) h.onText(h.text.slice(0, -1));
    else if (b === "x" && !h.disabled) h.onText(h.text + " ");
    else if (b === "y" && !h.disabled) h.onSend();
  }), []);

  const cur = clamp(pos.r, pos.c);
  const cls = (r: number, c: number) => "pk-key" + (cur.r === r && cur.c === c ? " on" : "");
  return (
    <div className="padkb" aria-label="On-screen keyboard">
      <div className="pk-row pk-sugg">
        {sugg.length === 0 && <span className="muted pk-none">Suggestions appear as you type</span>}
        {sugg.map((s, c) => <button type="button" key={s.text} className={cls(-1, c) + " sugg"} onClick={() => { setPos({ r: -1, c }); press(-1, c); }}>{s.label}</button>)}
      </div>
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
