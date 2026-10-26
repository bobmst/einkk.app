import { describe, expect, it } from "vitest";
import { finalRank, stayChance } from "./finalrank";
import type { Prediction } from "./outbox";

// made-up rows; the engine publishes ranges symmetric in log rank around the median
const p = {
  rank_slide: { hours_to_close: 30, level: 0.9, rows: [
    { rank_pc: 3, median: 5, lo: 4, hi: 6.25 },
    { rank_pc: 1, median: 2, lo: 1.6, hi: 2.5 },
    { rank_pc: 10, median: 15, lo: 12, hi: 18.75 },
  ] },
} as Prediction;

describe("finalRank", () => {
  it("reads a row as published", () => {
    const f = finalRank(p, 3)!;
    expect([f.median, f.lo, f.hi]).toEqual([5, 4, 6.25].map((v) => expect.closeTo(v, 9)));
  });

  it("interpolates between rows in log rank", () => {
    const f = finalRank(p, Math.sqrt(3))!;                   // halfway between 1% and 3% in log terms
    expect(f.median).toBeCloseTo(Math.sqrt(2 * 5), 6);
  });

  it("is null without a table or outside the ranks it covers", () => {
    expect(finalRank({} as Prediction, 2)).toBeNull();
    expect(finalRank(p, 0.5)).toBeNull();
    expect(finalRank(p, 12)).toBeNull();
  });
});

describe("stayChance", () => {
  it("is even at the median and matches the range's level at its ends", () => {
    const f = finalRank(p, 3)!;
    expect(stayChance(f, f.median)).toBeCloseTo(0.5, 3);
    expect(stayChance(f, f.hi)).toBeCloseTo(0.95, 2);
    expect(stayChance(f, f.lo)).toBeCloseTo(0.05, 2);
  });
});
