import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ES } from "../../web/src/es";

const WEB = path.resolve(__dirname, "../../web/src");
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

/** Every English text passed to t("…") and every option label of a segmented control. */
function keys(): Set<string> {
  const out = new Set<string>();
  for (const f of files(WEB)) {
    const s = fs.readFileSync(f, "utf-8");
    for (const m of s.matchAll(/(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]!.replace(/\\(["'])/g, "$1"));
    for (const m of s.matchAll(/options=\{\[(.*?)\]\}/g)) for (const l of m[1]!.matchAll(/\[(?:"\w+"|true|false), "((?:[^"\\]|\\.)*)"\]/g)) out.add(l[1]!);
  }
  return out;
}

describe("Spanish translation", () => {
  it("has an entry for every text in the UI", () => {
    const missing = [...keys()].filter((k) => !(k in ES));
    expect(missing).toEqual([]);
  });
  it("keeps the {placeholders} of the English text", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [k, v] of Object.entries(ES)) expect(ph(v), k).toBe(ph(k));
  });
});
