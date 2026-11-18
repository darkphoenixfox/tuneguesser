import React from "react";
import { usePad, type PadButtonName } from "./pad";

/** Button glyphs: glossy Xbox domes and PlayStation symbols, as in another project. */
const PS: Partial<Record<PadButtonName, { colour: string; shape: React.ReactNode }>> = {
  a: { colour: "#7c9bd8", shape: <path d="M-7 -7 L7 7 M7 -7 L-7 7" /> },
  b: { colour: "#d9525e", shape: <circle r="7.5" /> },
  x: { colour: "#b873b8", shape: <rect x="-7" y="-7" width="14" height="14" /> },
  y: { colour: "#2fae8c", shape: <path d="M0 -8.5 L8.2 5.5 L-8.2 5.5 Z" strokeLinejoin="round" /> },
};
const XBOX: Partial<Record<PadButtonName, { light: string; mid: string; dark: string; letter: React.ReactNode }>> = {
  a: { light: "#c4e06a", mid: "#86b43a", dark: "#4d7a1c", letter: <path d="M-6.5 7 L0 -7 L6.5 7 M-3.2 2.2 L3.2 2.2" /> },
  b: { light: "#f08070", mid: "#c8312b", dark: "#7e1512", letter: <path d="M-4.5 -7 L-4.5 7 M-4.5 -7 L1.5 -7 Q5.5 -7 5.5 -3.5 Q5.5 0 1.5 0 L-4.5 0 M1.5 0 Q6.5 0 6.5 3.5 Q6.5 7 1.5 7 L-4.5 7" /> },
  x: { light: "#7cc8f4", mid: "#2a8fd8", dark: "#115a96", letter: <path d="M-6 -7 L6 7 M6 -7 L-6 7" /> },
  y: { light: "#ffd36a", mid: "#f0a81c", dark: "#a6620a", letter: <path d="M-6 -7 L0 0 L6 -7 M0 0 L0 7.5" /> },
};
const TEXT: Record<"xbox" | "ps", Partial<Record<PadButtonName, string>>> = {
  xbox: { start: "☰", select: "⧉" },
  ps: { start: "OPT", select: "SHARE", lb: "L1", rb: "R1" },
};

function Xbox({ button }: { button: PadButtonName }) {
  const id = `xb${button}` + React.useId().replace(/:/g, "");
  const c = XBOX[button]!;
  return (
    <svg className="pad-glyph-svg" viewBox="-16 -16 32 32" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}d`} cx="0.5" cy="0.62" r="0.62"><stop offset="0" stopColor={c.light} /><stop offset="0.7" stopColor={c.mid} /><stop offset="1" stopColor={c.dark} /></radialGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.75" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <circle r="15.2" fill="#0a0a0a" />
      <circle r="13.6" fill={`url(#${id}d)`} stroke={c.dark} strokeWidth="1" />
      <ellipse cx="0" cy="-8.2" rx="9.6" ry="5" fill={`url(#${id}g)`} />
      <g fill="none" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <g stroke="#fff" opacity="0.4" transform="translate(0.4 0.8)">{c.letter}</g>
        <g stroke={c.dark} opacity="0.95">{c.letter}</g>
      </g>
    </svg>
  );
}

export function Glyph({ button }: { button: PadButtonName }) {
  const { layout } = usePad();
  if (layout === "xbox" && XBOX[button]) return <Xbox button={button} />;
  const sym = layout === "ps" ? PS[button] : undefined;
  if (sym) {
    return (
      <svg className="pad-glyph-svg" viewBox="-16 -16 32 32" aria-hidden="true">
        <circle r="15" fill="#2b2b2e" stroke="#0d0d0f" strokeWidth="1.5" />
        <g fill="none" stroke={sym.colour} strokeWidth="2.4" strokeLinecap="round">{sym.shape}</g>
      </svg>
    );
  }
  return <span className="pad-glyph-text">{TEXT[layout][button] ?? button.toUpperCase()}</span>;
}

/** A glyph only while a pad is connected. */
export function PadHint({ button }: { button: PadButtonName }) {
  const { connected } = usePad();
  return connected ? <span className="pad-hint"><Glyph button={button} /></span> : null;
}

/** Small keycap label, e.g. <Key>Enter</Key> */
export const Key = ({ children }: { children: React.ReactNode }) => <kbd className="keycap">{children}</kbd>;
