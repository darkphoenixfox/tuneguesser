/** Auto-completion for the on-screen keyboard: single words from the playlist's titles and artists, then common English words. */
export interface Suggestion {
  /** shown on the key */
  label: string;
  /** the full answer text after picking it */
  text: string;
}

import { COMMON_WORDS } from "./dictionary";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const stripEdges = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Up to `max` word completions for the word being typed (words only, never whole titles): playlist words first, then a common-word dictionary. */
export function suggest(text: string, phrases: string[], max = 5): Suggestion[] {
  const out: Suggestion[] = [];
  const m = /(\S*)$/.exec(text)!;
  const token = norm(m[1]!);
  if (token.length >= 1) {
    const before = text.slice(0, text.length - m[1]!.length);
    const words = new Map<string, string>();
    for (const p of phrases) for (const raw of p.split(/\s+/)) {
      const w = stripEdges(raw);
      const n = norm(w);
      if (n.length > token.length && n.startsWith(token) && !words.has(n)) words.set(n, w.toLowerCase());
    }
    const ranked = [...words.values()].sort((a, b) => a.length - b.length || a.localeCompare(b));
    // playlist words first (at most 3, so that common words get a place too), then the common-word dictionary
    for (const w of ranked.slice(0, 3)) out.push({ label: w, text: before + w + " " });
    const have = new Set(out.map((o) => norm(o.label)));
    for (const w of COMMON_WORDS) {
      if (out.length >= max) break;
      if (w.length > token.length && w.startsWith(token) && !have.has(w)) { have.add(w); out.push({ label: w, text: before + w + " " }); }
    }
    for (const w of ranked.slice(3)) {
      if (out.length >= max) break;
      if (!have.has(norm(w))) { have.add(norm(w)); out.push({ label: w, text: before + w + " " }); }
    }
  }
  return out;
}
