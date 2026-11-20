import { useSyncExternalStore } from "react";
import { ES } from "./es";
import { IT } from "./it";

export type Lang = "en" | "es" | "it";
export const LANGS: Array<[Lang, string]> = [["en", "English"], ["es", "Español"], ["it", "Italiano"]];
const DICTS: Partial<Record<Lang, Record<string, string>>> = { es: ES, it: IT };
const isLang = (v: unknown): v is Lang => LANGS.some(([c]) => c === v);
const KEY = "tg_lang";

const detect = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* storage blocked */ }
  const nav = typeof navigator !== "undefined" ? navigator.language.slice(0, 2).toLowerCase() : "";
  return isLang(nav) ? nav : "en";
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
  const s = DICTS[lang]?.[text] ?? text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Re-renders the component when the language changes. Call it once near the root of every React tree. */
export function useLang(): Lang {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLang);
}
