import { describe, expect, it } from "vitest";
import { cdf, chanceText, density, ratios, tierFor } from "../src/lib/slice";
import type { Prediction } from "../src/lib/outbox";

const base = { prediction: 200, band: { lo: 184, hi: 216, level: 0.9, method: "conformal_walk_forward" } } as unknown as Prediction;

describe("tier slice", () => {
  const p = { ...base, residuals: [{ season: 41, error_pct: 2 }, { season: 40, error_pct: -5 }, { season: 39, error_pct: 3 }] } as Prediction;

  it("mirrors the misses, as the bands do", () => {
    expect(ratios(p).sort()).toEqual([0.95, 0.97, 0.98, 1.02, 1.03, 1.05].sort());
  });

  it("is centred on the forecast and integrates to one", () => {
    const xs = ratios(p);
    expect(cdf(xs, 1)).toBeCloseTo(0.5, 6);
    const grid = Array.from({ length: 2001 }, (_, i) => 0.7 + i * 0.0003);
    const area = density(xs, grid).reduce((s, y) => s + y * 0.0003, 0);
    expect(area).toBeCloseTo(1, 2);
  });

  it("gives a higher score a higher chance of clearing the line (the line ending below it)", () => {
    const xs = ratios(p);
    expect(cdf(xs, 0.9)).toBeLessThan(0.02);                  // a score far below the forecast line
    expect(cdf(xs, 1.03)).toBeGreaterThan(cdf(xs, 1.0));
    expect(cdf(xs, 1.1)).toBeGreaterThan(0.98);               // far above it
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
