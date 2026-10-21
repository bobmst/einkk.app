import { describe, expect, it } from "vitest";
import { bandwidth, cdf, chanceCell, chances, chanceText, density, quantile, ratios, tierFor } from "../src/lib/slice";
import type { Prediction } from "../src/lib/outbox";

const base = { prediction: 200, band: { lo: 184, hi: 216, level: 0.9, method: "conformal_walk_forward" } } as unknown as Prediction;
const misses = (...pcts: number[]) =>
  ({ ...base, residuals: pcts.map((error_pct, i) => ({ season: 41 - i, error_pct })) }) as Prediction;

describe("tier slice", () => {
  const p = misses(2, -5, 3);

  it("takes each miss both ways round: final / forecast = 1 / (1 ± |error|)", () => {
    expect(ratios(p).map((r) => +r.toFixed(4)).sort())
      .toEqual([1 / 1.02, 1 / 0.98, 1 / 1.05, 1 / 0.95, 1 / 1.03, 1 / 0.97].map((r) => +r.toFixed(4)).sort());
  });

  it("integrates to one", () => {
    const xs = ratios(p);
    const grid = Array.from({ length: 2001 }, (_, i) => 0.7 + i * 0.0003);
    const area = density(xs, grid).reduce((s, y) => s + y * 0.0003, 0);
    expect(area).toBeCloseTo(1, 2);
  });

  it("doesn't lean on the misses' signs", () => {
    // S42 GLOBAL's router misses: 6 of 9 low, which a sign-flip test can't tell from noise
    const global = [-5.09, -4.26, -4.1, -3.35, -2.54, -0.5, 1.05, 2.1, 2.9];
    const xs = ratios(misses(...global));
    expect(xs).toEqual(ratios(misses(...global.map((e) => -e))));
    expect(cdf(xs, 1)).toBeCloseTo(0.5, 1);
  });

  it("draws one peak at the forecast from misses that leave a hole there", () => {
    // the #46 case: only one of GLOBAL's nine misses is inside ±1%
    const xs = ratios(misses(-5.09, -4.26, -4.1, -3.35, -2.54, -0.5, 1.05, 2.1, 2.9));
    const grid = Array.from({ length: 401 }, (_, i) => 0.9 + i * 0.0005);
    const ys = density(xs, grid);
    const peaks = ys.filter((y, i) => i > 0 && i < ys.length - 1 && y > ys[i - 1] && y >= ys[i + 1]).length;
    expect(peaks).toBe(1);
  });

  it("draws one peak, widening the bandwidth when the misses alone would give two", () => {
    const xs = ratios(misses(-6, -5.5, -5, 5, 5.5, 6));            // two tight clusters
    const grid = Array.from({ length: 401 }, (_, i) => 0.88 + i * 0.0006);
    const ys = density(xs, grid);
    const peaks = ys.filter((y, i) => i > 0 && i < ys.length - 1 && y > ys[i - 1] && y >= ys[i + 1]).length;
    expect(peaks).toBe(1);
    expect(bandwidth(xs)).toBeGreaterThan(0.004);
  });

  it("puts its 9-in-10 range around 90% of the curve", () => {
    const xs = ratios(p);
    expect(cdf(xs, quantile(xs, 0.95)) - cdf(xs, quantile(xs, 0.05))).toBeCloseTo(0.9, 3);
  });

  it("gives a higher score a higher chance of clearing the line (the line ending below it)", () => {
    const xs = ratios(p);
    expect(cdf(xs, 0.9)).toBeLessThan(0.02);                  // a score far below the forecast line
    expect(cdf(xs, 1.03)).toBeGreaterThan(cdf(xs, 1.0));
    expect(cdf(xs, 1.15)).toBeGreaterThan(0.98);              // far above it (3 misses: wide tails)
  });

  it("falls back to the band without residuals", () => {
    const xs = ratios(base);
    expect(cdf(xs, 216 / 200) - cdf(xs, 184 / 200)).toBeGreaterThan(0.8);
  });

  it("never claims certainty", () => {
    expect(chanceText(0.004)).toBe("1%");
    expect(chanceText(0.996)).toBe("99%");
    expect(chanceText(0.7049)).toBe("70%");
  });
});

describe("chances", () => {
  const cells = [0.5, 0.7, 1, 2, 3, 5, 10].map((percentile) => ({ percentile, value: 100 / percentile }));
  const xs = [0.97, 0.98, 0.99, 1, 1, 1.01, 1.02, 1.03];
  it("gives each tier the slice's own chance", () => {
    const odds = chances(xs, cells, 25);
    for (const c of cells) expect(odds.get(c.percentile)).toBeCloseTo(cdf(xs, 25 / c.value), 12);
  });
  it("reads a score between two tiers' ranges as nearly sure of one, nearly out of the other", () => {
    const odds = chances(xs, cells, 25);            // 3% line 33.3, 5% line 20
    expect(odds.get(3)).toBeLessThan(0.01);
    expect(odds.get(5)).toBeGreaterThan(0.99);
  });
});

describe("chanceCell", () => {
  it("leaves a hopeless tier blank and marks a sure one instead of rounding to 99%", () => {
    expect(chanceCell(0.001)).toBe("");
    expect(chanceCell(0.999)).toBe(">99%");
    expect(chanceCell(0.006)).toBe("1%");
    expect(chanceCell(0.42)).toBe("42%");
  });
});

describe("tierFor", () => {
  const cells = [0.5, 0.7, 1, 2, 3, 5, 10].map((percentile) => ({ percentile, value: 100 / percentile }));
  const xs = [0.97, 0.98, 0.99, 1, 1, 1.01, 1.02, 1.03];      // median 1
  it("opens on 3% with no score", () => {
    expect(tierFor(cells, null, xs)).toBe(3);
    expect(tierFor(cells.filter((c) => c.percentile !== 3), null, xs)).toBe(0.5);
  });
  it("opens on the tier whose chance is nearest even", () => {
    const odds = chances(xs, cells, 34);                     // just above the 3% line (33.3)
    const nearest = [...odds].sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5))[0][0];
    expect(odds.get(3)).toBeGreaterThan(0.6);
    expect(odds.get(3)).toBeLessThan(0.99);
    expect(tierFor(cells, 34, xs)).toBe(nearest);
    expect(tierFor(cells, 34, xs)).toBe(3);
    expect(tierFor(cells, 40, xs)).toBe(3);                  // between 2% (50) and 3%, nearer 3%
    expect(tierFor(cells, 25, xs)).toBe(5);                  // in the 3%-5% gap, nearer 5% (20)
  });
  it("follows the chance, not the distance, on a skewed curve", () => {
    const skewed = [0.9, 0.97, 0.98, 0.99, 1, 1, 1.01, 1.01];   // a long low tail
    const odds = chances(skewed, cells, 34);
    const nearest = [...odds].sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5))[0][0];
    expect(tierFor(cells, 34, skewed)).toBe(nearest);
  });
  it("still ranks the tiers when every chance has run out", () => {
    expect(tierFor(cells, 1000, xs)).toBe(0.5);              // above every tier
    expect(tierFor(cells, 1, xs)).toBe(10);                  // below every tier
  });
});
