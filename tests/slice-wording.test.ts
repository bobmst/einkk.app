// #92: the distribution panel's sentence comes from the page's own curve over past misses, while
// the table and the shaded band show the band the engine certified. The sentence must not carry a
// "90%" of its own, in any language, or two different ranges read as one figure.
import { describe, expect, it } from "vitest";
import { LANGS, text } from "../src/lib/i18n";

describe("the slice's range sentence", () => {
  for (const lang of LANGS) {
    it(`names no percentage in ${lang}`, () => {
      const line = text(lang).likelyRange("A", "B");
      expect(line).toContain("A");
      expect(line).toContain("B");
      expect(line).not.toMatch(/\d\s*[%％]|\b9\s*(in|de)\s*10\b/);
    });
  }
});
