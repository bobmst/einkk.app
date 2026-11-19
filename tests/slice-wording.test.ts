// #92: the slice under the damage checker marks the same range the tier table shows: the engine's
// widest band scaled to the tier, with the level the engine certified. It never draws a range of
// its own from the page's curve, so one line never has two different "90%" ranges on the page.
import { describe, expect, it } from "vitest";
import { LANGS, text } from "../src/lib/i18n";
import type { Prediction } from "../src/lib/outbox";
import { tierRange } from "../src/lib/slice";

const p = {
  prediction: 200,
  band: { lo: 170, hi: 230, level: 0.9, method: "conformal_walk_forward" },
  bands: [{ level: 0.5, lo: 190, hi: 210 }, { level: 0.9, lo: 170, hi: 230 }],
  residuals: [{ season: 1, error_pct: 5 }, { season: 2, error_pct: -3 }, { season: 3, error_pct: 8 }],
} as unknown as Prediction;

describe("the slice's range", () => {
  it("is the widest band, scaled to the tier like the table's range column", () => {
    expect(tierRange(p, 100)).toEqual({ level: 0.9, lo: 85, hi: 115 });
    expect(tierRange(p, 200)).toEqual({ level: 0.9, lo: 170, hi: 230 });
  });

  it("carries a capped level as the engine certified it", () => {
    const capped = { ...p, bands: [{ level: 6 / 7, lo: 175, hi: 225 }] } as unknown as Prediction;
    expect(tierRange(capped, 200).level).toBeCloseTo(6 / 7);
  });

  for (const lang of LANGS) {
    it(`names the tier, the forecast, the level and both ends in ${lang}`, () => {
      const line = text(lang).sliceLine(3, "X", 85.7, "A", "B");
      for (const part of ["3", "X", "85.7", "A", "B"]) expect(line).toContain(part);
    });
  }
});
