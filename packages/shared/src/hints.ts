/** "Reveal" hint: underscores for every letter of the title/artist, letters shown one by one as the timer runs. */

/** The title as players would type it: without (...)/[...] parts, " - Remastered" suffixes and feat. credits. */
export function hintText(title: string): string {
  let t = title.replace(/\s*[(\[][^)\]]*[)\]]/g, " ");
  const dash = t.split(/\s+[-–—]\s+/);
  if (dash.length > 1) t = dash[0]!;
  t = t.replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/i, "");
  return t.replace(/\s+/g, " ").trim();
}

const isLetter = (c: string) => /[\p{L}\p{N}]/u.test(c);

/** Character positions that are letters/digits. */
export function letterPositions(text: string): number[] {
  const out: number[] = [];
  [...text].forEach((c, i) => { if (isLetter(c)) out.push(i); });
  return out;
}

/** How many letters to show after `progress` (0..1) of the time: spread evenly, every letter is visible just before the time is up. */
export function revealCount(progress: number, letters: number, doneAt = 0.95): number {
  return Math.floor(Math.min(1, Math.max(0, progress) / doneAt) * letters);
}

/** Replaces letters with "_" except the first `count` positions of `order` (a shuffled list of letter positions). */
export function maskText(text: string, order: number[], count: number): string {
  const shown = new Set(order.slice(0, count));
  return [...text].map((c, i) => (isLetter(c) && !shown.has(i) ? "_" : c)).join("");
}
