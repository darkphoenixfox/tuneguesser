import type { Track } from "./music";

/**
 * "Trivia" hint facts about the artist/song. Sources, in the order facts are shown (vaguest first):
 *  - MusicBrainz: genre tags, country/area, formed/born year
 *  - the song's release year (from Spotify)
 *  - Wikipedia: the first sentence about the artist, with the artist's name blanked out
 * Every request has a short timeout; anything that fails is skipped, so a round never waits on trivia.
 */
type Fetcher = typeof fetch;
// A generic client name on purpose: no personal contact details are sent to these services.
const UA = "TuneGuesser/1.0 (home game)";

async function getJson(url: string, f: Fetcher): Promise<any | null> {
  try {
    const r = await f(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** MusicBrainz tags are free-form user input ("2008 universal fire victim", "seen live"): only keep tags that look like a genre. */
const GENRE_WORD = /\b(rock|pop|metal|punk|jazz|blues|soul|funk|folk|country|hip[- ]?hop|rap|r&b|rnb|reggae|ska|electronic|electro|dance|house|techno|trance|disco|indie|alternative|grunge|new wave|synth|wave|classical|latin|gospel|swing|opera|ambient|industrial|hardcore|emo|psychedelic|progressive|singer-songwriter|soundtrack|world|reggaeton|salsa|flamenco|bossa nova|trap|drum and bass|dubstep|garage|britpop|shoegaze|dream pop|j-pop|k-pop)\b/i;
export const isGenreTag = (t: string) => GENRE_WORD.test(t) && !/\d{3,}/.test(t);

export async function artistFacts(name: string, f: Fetcher = fetch): Promise<{ genre?: string; origin?: string; started?: string; about?: string }> {
  const out: { genre?: string; origin?: string; started?: string; about?: string } = {};
  const mb = await getJson(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&limit=3&fmt=json`, f);
  const a = (mb?.artists ?? []).find((x: any) => x.score >= 90 && norm(x.name) === norm(name));
  if (a) {
    const tags = [...(a.tags ?? [])].sort((p: any, q: any) => q.count - p.count).map((t: any) => String(t.name)).filter(isGenreTag).slice(0, 3);
    if (tags.length) out.genre = `Genre: ${tags.join(", ")}`;
    const area = a.area?.name ?? a["begin-area"]?.name;
    if (area) out.origin = `${a.type === "Group" ? "A group" : "An artist"} from ${area}`;
    const year = String(a["life-span"]?.begin ?? "").slice(0, 4);
    if (/^\d{4}$/.test(year)) out.started = a.type === "Group" ? `Formed in ${year}` : `Born in ${year}`;
  }
  // the page must be about this artist: a search for "U2 musician" once returned the Musicians' Union page
  const bare = (x: string) => norm(x.replace(/\s*\([^)]*\)\s*$/, ""));
  const MUSICY = /singer|band|musician|rapper|group|duo|composer|producer|songwriter|vocalist|\bDJ\b/i;
  const tried = new Set<string>();
  let sum: any;
  search: for (const q of [name, `${name} band`, `${name} musician`]) {
    const found = await getJson(`https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=5`, f);
    for (const p of found?.pages ?? []) {
      if (bare(String(p.title ?? "")) !== norm(name) || !p.key || tried.has(p.key)) continue;
      tried.add(p.key);
      const cand = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`, f); // "Prince" is a title of nobility; "Prince (musician)" is the one
      if (cand?.type === "standard" && MUSICY.test(cand.description ?? "") && typeof cand.extract === "string") { sum = cand; break search; }
    }
  }
  if (sum) {
    let first = sum.extract.replace(/\s*\([^)]*\)/g, "").split(/(?<=[.!?])\s+/)[0] ?? "";
    first = first.replace(new RegExp(esc(name), "gi"), "this artist");
    // other words of the name (e.g. a surname) would also give it away
    for (const w of name.split(/\s+/).filter((w) => w.length >= 4)) first = first.replace(new RegExp(`\\b${esc(w)}\\b`, "gi"), "…");
    if (first.length >= 20 && first.length <= 260) out.about = first;
  }
  return out;
}

export async function triviaFor(track: Track, f: Fetcher = fetch): Promise<string[]> {
  const main = track.artists[0];
  const a = main ? await artistFacts(main, f) : {};
  const facts = [a.genre, a.origin, a.started, track.year ? `This song came out in ${track.year}` : undefined, a.about];
  return facts.filter((x): x is string => !!x);
}

/** Starts fetching early and remembers results, so a round never waits for the network. */
export class TriviaCache {
  private cache = new Map<string, Promise<string[]>>();
  private done = new Map<string, string[]>();
  constructor(private f: Fetcher = fetch) {}
  prefetch(track: Track) {
    if (this.cache.has(track.id)) return;
    this.cache.set(track.id, triviaFor(track, this.f).then((facts) => { this.done.set(track.id, facts); return facts; }, () => []));
  }
  /** facts known so far (empty until the fetch finishes) */
  peek(track: Track): string[] {
    this.prefetch(track);
    return this.done.get(track.id) ?? [];
  }
}
