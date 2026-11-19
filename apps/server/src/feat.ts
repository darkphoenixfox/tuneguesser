import type { Track } from "./music";

const FEAT = /\s*[(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+?)\s*[)\]]|\s+[-–—]?\s*(?:feat\.?|ft\.?|featuring)\s+(.+)$/gi;

/**
 * "Seven (feat. Latto)" becomes "Seven". The featured artists are added to the artist field when they are not in it
 * (the artist guess only needs ONE of the credited artists, so they are never required).
 */
export function cleanFeat(t: Track): Track {
  const names: string[] = [];
  const title = t.title.replace(FEAT, (_m, inBrackets: string | undefined, trailing: string | undefined) => {
    names.push(...(inBrackets ?? trailing ?? "").split(/\s*,\s*|\s*&\s*|\s+x\s+/i).map((x) => x.trim()).filter(Boolean));
    return "";
  }).replace(/\s{2,}/g, " ").trim();
  if (!names.length || !title) return t;
  const known = new Set(t.artists.map((a) => a.trim().toLowerCase()));
  const artists = [...t.artists];
  for (const n of names) if (!known.has(n.toLowerCase())) { known.add(n.toLowerCase()); artists.push(n); }
  return { ...t, title, artists };
}
