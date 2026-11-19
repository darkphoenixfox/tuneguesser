import { useSyncExternalStore } from "react";
import { ES } from "./es";

export type Lang = "en" | "es";
export const LANGS: Array<[Lang, string]> = [["en", "English"], ["es", "Español"]];
const KEY = "tg_lang";

const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch { /* storage blocked */ }
  return typeof navigator !== "undefined" && /^es\b/i.test(navigator.language) ? "es" : "en";
};

let lang: Lang = detect();
const listeners = new Set<() => void>();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
if (typeof document !== "undefined") document.documentElement.lang = lang;

/**
 * Translates an English UI text. The English text is the key, so a missing translation shows the English text.
 * `{name}` placeholders are filled from `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const s = lang === "es" ? ES[text] ?? text : text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Re-renders the component when the language changes. Call it once near the root of every React tree. */
export function useLang(): Lang {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLang);
}
