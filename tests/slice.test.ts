import { describe, expect, it } from "vitest";
import { bandwidth, cdf, chanceText, density, quantile, ratios, tierFor } from "../src/lib/slice";
import type { Prediction } from "../src/lib/outbox";

const base = { prediction: 200, band: { lo: 184, hi: 216, level: 0.9, method: "conformal_walk_forward" } } as unknown as Prediction;
const misses = (...pcts: number[]) =>
  ({ ...base, residuals: pcts.map((error_pct, i) => ({ season: 41 - i, error_pct })) }) as Prediction;

describe("tier slice", () => {
  const p = misses(2, -5, 3);

  it("keeps the sign of the misses: final / forecast = 1 / (1 + error)", () => {
    expect(ratios(p).map((r) => +r.toFixed(4)).sort()).toEqual([1 / 1.02, 1 / 0.95, 1 / 1.03].map((r) => +r.toFixed(4)).sort());
  });

  it("integrates to one", () => {
    const xs = ratios(p);
    const grid = Array.from({ length: 2001 }, (_, i) => 0.7 + i * 0.0003);
    const area = density(xs, grid).reduce((s, y) => s + y * 0.0003, 0);
    expect(area).toBeCloseTo(1, 2);
  });

  it("leans toward the side the forecast has missed on", () => {
    // S42 GLOBAL's router misses: mostly the forecast ran low, so the line tends to end above it
    const xs = ratios(misses(-5.09, -4.26, -4.1, -3.35, -2.54, -0.5, 1.05, 2.1, 2.9));
    expect(cdf(xs, 1)).toBeLessThan(0.45);
    expect(quantile(xs, 0.95) - 1).toBeGreaterThan(1 - quantile(xs, 0.05));
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

describe("tierFor", () => {
  const cells = [0.5, 0.7, 1, 2, 3, 5, 10].map((percentile) => ({ percentile, value: 100 / percentile }));
  it("picks the tier the score sits in", () => {
    expect(tierFor(cells, null)).toBe(3);
    expect(tierFor(cells, { kind: "at", percentile: 0.89 })).toBe(1);
    expect(tierFor(cells, { kind: "at", percentile: 2 })).toBe(2);
    expect(tierFor(cells, { kind: "at", percentile: 3.4 })).toBe(5);
    expect(tierFor(cells, { kind: "above", percentile: 0.5 })).toBe(0.5);
    expect(tierFor(cells, { kind: "below", percentile: 10 })).toBe(10);
  });
});
