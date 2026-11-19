// #112: every language says the same numbers. A string that takes a value prints it in every
// language, so none of them writes a number of its own next to (or instead of) the one passed in.
import { describe, expect, it } from "vitest";
import { LANGS, text } from "./i18n";

// arguments a string reads without printing them (finalsError's hit picks the wording)
const UNPRINTED: Record<string, number[]> = { finalsError: [1] };

describe.each(LANGS)("%s", (lang) => {
  const t = text(lang) as unknown as Record<string, unknown>;
  const fns = Object.entries(t).filter((e): e is [string, (...a: unknown[]) => string] => typeof e[1] === "function");

  it.each(fns.map(([k]) => k))("%s prints every value it is given", (key) => {
    const fn = t[key] as (...a: unknown[]) => string;
    const english = text("en") as unknown as Record<string, (...a: unknown[]) => string>;
    const args = Array.from({ length: english[key].length }, (_, i) => 7001 + i);
    const out = fn(...args);
    args.forEach((a, i) => {
      if (!UNPRINTED[key]?.includes(i)) expect(out, `${key} arg ${i}`).toContain(String(a));
    });
  });

  it("writes the confirming count only where it is passed in", () => {
    const out = text(lang).finalsUnconfirmed(5).replace(/3\s?%/g, "");      // "near 3%" is the tier
    expect(out).toContain("5");
    expect(out).not.toMatch(/(^|\D)3(\D|$)/);
  });
});
