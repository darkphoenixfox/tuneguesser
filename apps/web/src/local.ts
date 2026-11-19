/** This browser's own corrections and bans (title/artist fixes, banned songs, "one artist only"). Sent with every room it creates. */
export interface LocalEdits {
  tracks: Record<string, { title?: string; artists?: string[] }>;
  banned: string[];
  /** playlist id -> artist ("" = switched off on this device even if the default says otherwise) */
  artists: Record<string, string>;
}

const KEY = "tg_local";

export function getLocal(): LocalEdits {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { tracks: d?.tracks && typeof d.tracks === "object" ? d.tracks : {}, banned: Array.isArray(d?.banned) ? d.banned : [], artists: d?.artists && typeof d.artists === "object" ? d.artists : {} };
  } catch { return { tracks: {}, banned: [], artists: {} }; }
}

export function updateLocal(f: (l: LocalEdits) => void): LocalEdits {
  const l = getLocal();
  f(l);
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked: the change lasts only until reload */ }
  return l;
}

/** Names this device gave to playlists (playlist id -> name). */
export const getNames = (): Record<string, string> => { try { const d = JSON.parse(localStorage.getItem("tg_ytnames") ?? "{}"); return d && typeof d === "object" ? d : {}; } catch { return {}; } };
export function setLocalName(id: string, name: string | null) {
  const n = getNames();
  if (name) n[id] = name; else delete n[id];
  try { localStorage.setItem("tg_ytnames", JSON.stringify(n)); } catch { /* storage blocked */ }
}

/** Playlists this device has taken off its list. */
export const getGone = (): string[] => { try { const d = JSON.parse(localStorage.getItem("tg_ytgone") ?? "[]"); return Array.isArray(d) ? d : []; } catch { return []; } };
export function setGone(id: string, gone: boolean) {
  const l = getGone().filter((x) => x !== id);
  if (gone) l.push(id);
  try { localStorage.setItem("tg_ytgone", JSON.stringify(l)); } catch { /* storage blocked */ }
}

export const banLocal = (id: string) => updateLocal((l) => { if (!l.banned.includes(id)) l.banned.push(id); });
export const unbanLocal = (id: string) => updateLocal((l) => { l.banned = l.banned.filter((x) => x !== id); });
