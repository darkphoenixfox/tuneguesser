/** Auto-completion for the on-screen keyboard: whole titles/artists and single words from the playlist. */
export interface Suggestion {
  /** shown on the key */
  label: string;
  /** the full answer text after picking it */
  text: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const stripEdges = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Up to `max` suggestions for what has been typed so far: whole phrases first (max 2), then words for the word being typed. */
export function suggest(text: string, phrases: string[], max = 5): Suggestion[] {
  const out: Suggestion[] = [];
  const typed = norm(text).trim();
  if (typed.length >= 2) {
    const seen = new Set<string>();
    for (const p of phrases) {
      const n = norm(p);
      if (n.startsWith(typed) && n !== typed && !seen.has(n)) {
        seen.add(n);
        out.push({ label: p, text: p });
        if (out.length >= 2) break;
      }
    }
  }
  const m = /(\S*)$/.exec(text)!;
  const token = norm(m[1]!);
  if (token.length >= 1) {
    const before = text.slice(0, text.length - m[1]!.length);
    const words = new Map<string, string>();
    for (const p of phrases) for (const raw of p.split(/\s+/)) {
      const w = stripEdges(raw);
      const n = norm(w);
      if (n.length > token.length && n.startsWith(token) && !words.has(n)) words.set(n, w);
    }
    const ranked = [...words.values()].sort((a, b) => a.length - b.length || a.localeCompare(b));
    for (const w of ranked) {
      if (out.length >= max) break;
      out.push({ label: w, text: before + w + " " });
    }
  }
  return out;
}
