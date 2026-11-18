/**
 * Answer matching: decides whether a typed guess is "close enough" to the
 * real song title / artist(s) coming from Spotify.
 */

export interface TrackInfo {
  title: string;
  artists: string[];
}

export interface MatchResult {
  title: boolean;
  artist: boolean;
}

/** Lowercase, strip accents, unify symbols, drop punctuation, collapse spaces. */
export function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripLeadingArticle(s: string): string {
  return s.replace(/^(the|a|an)\s+/, "");
}

const VERSION_WORDS =
  /(remaster(ed)?|mono|stereo|live|version|edit|mix|radio|single|deluxe|bonus|demo|acoustic|\d{4})/i;

/** All acceptable forms of a title: full, without (...)/[...], without " - Remastered" suffix, without feat. */
export function titleVariants(title: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const n = stripLeadingArticle(normalize(s));
    if (n) out.add(n);
  };

  add(title);
  const noBrackets = title.replace(/\s*[(\[][^)\]]*[)\]]/g, " ");
  add(noBrackets);

  // "Song - 2011 Remaster", "Song - Live at ..."
  const dash = noBrackets.split(/\s+[-–—]\s+/);
  if (dash.length > 1 && dash.slice(1).every((p) => VERSION_WORDS.test(p) || /^(feat|ft|with)\b/i.test(p))) {
    add(dash[0]!);
  }
  // "Song feat. Someone" / "Song ft Someone"
  add(noBrackets.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.*$/i, ""));
  add(dash[0]!.replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, ""));
  return [...out];
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d: number[][] = Array.from({ length: al + 1 }, (_, i) => {
    const row = new Array<number>(bl + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= bl; j++) d[0]![j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[al]![bl]!;
}

/** Typos allowed grows with length: short words must be exact. */
export function allowedTypos(len: number): number {
  if (len <= 3) return 0;
  if (len <= 7) return 1;
  if (len <= 14) return 2;
  return Math.min(4, Math.floor(len * 0.15));
}

function fuzzyEquals(a: string, b: string): boolean {
  if (a === b) return true;
  // Digits must match exactly ("Blink 182" vs "Blink 183" is wrong).
  const digits = (s: string) => s.replace(/\D/g, "");
  if (digits(a) !== digits(b)) return false;
  return editDistance(a, b) <= allowedTypos(Math.max(a.length, b.length));
}

export function matchTitle(guess: string, actualTitle: string): boolean {
  const g = stripLeadingArticle(normalize(guess));
  if (!g) return false;
  return titleVariants(actualTitle).some((v) => fuzzyEquals(g, v));
}

/** Split a typed artist answer like "Daft Punk ft. Pharrell" or "A, B & C" into parts. */
function splitArtistGuess(guess: string): string[] {
  const parts = guess
    .split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bx\b|\bwith\b|\/)\s*/i)
    .map((p) => stripLeadingArticle(normalize(p)))
    .filter(Boolean);
  const whole = stripLeadingArticle(normalize(guess));
  return [...new Set([whole, ...parts])];
}

/**
 * Artist is correct if the guess (or any part of it) matches ANY credited artist,
 * or the full credited list joined together.
 */
export function matchArtist(guess: string, actualArtists: string[]): boolean {
  if (!normalize(guess)) return false;
  const targets = actualArtists.map((a) => stripLeadingArticle(normalize(a)));
  targets.push(targets.join(" "));
  const guesses = splitArtistGuess(guess);
  return guesses.some((g) => targets.some((t) => fuzzyEquals(g, t)));
}

export function matchAnswer(
  guess: { title?: string; artist?: string },
  track: TrackInfo,
): MatchResult {
  return {
    title: guess.title ? matchTitle(guess.title, track.title) : false,
    artist: guess.artist ? matchArtist(guess.artist, track.artists) : false,
  };
}
