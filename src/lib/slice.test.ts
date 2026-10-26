import { describe, expect, it } from "vitest";
import type { Cell } from "./outbox";
import { closedTiers, tierFor } from "./slice";

const cells: Cell[] = [0.5, 1, 2, 3, 5, 10].map((percentile, i) => ({ percentile, value: 300 - 20 * i }));
const xs = [0.97, 0.98, 0.99, 1, 1.01, 1.02, 1.03];

describe("closedTiers", () => {
  it("closes every tier the rank is already past, and only those", () => {
    expect([...closedTiers(cells, 2.35)]).toEqual([0.5, 1, 2]);
  });

  it("keeps the tier the rank sits exactly on open", () => {
    expect(closedTiers(cells, 3).has(3)).toBe(false);
  });

  it("closes nothing without a rank", () => {
    expect(closedTiers(cells, null).size).toBe(0);
  });
});

describe("tierFor with closed tiers", () => {
  it("passes over a closed tier the score would otherwise open on", () => {
    expect(tierFor(cells, 280, xs)).toBe(1);                       // the 1% line is 280
    expect(tierFor(cells, 280, xs, closedTiers(cells, 1.5))).toBe(2);
  });

  it("opens on the widest tier when every tier is closed", () => {
    expect(tierFor(cells, 280, xs, closedTiers(cells, 12))).toBe(10);
  });
});
