// Where a tier's final line may land: a smooth curve over the possible final
// values, and the chance a given score clears it. Built from the forecast's own
// walk-forward misses (prediction.residuals), taken both ways round, which is
// how its bands are built too, so the curve, its 90% range and the bands agree.
import type { Placement } from "./numbers";
import type { Cell, Prediction } from "./outbox";

const SQRT2 = Math.SQRT2;

/** final / forecast ratios the misses imply, mirrored (the bands use |miss|). */
export function ratios(p: Prediction): number[] {
  const misses = (p.residuals ?? []).map((r) => Math.abs(r.error_pct) / 100);
  if (misses.length >= 3) return misses.flatMap((m) => [1 + m, 1 - m]);
  // an older document without residuals: a normal shape matching its band
  const band = p.bands?.length ? p.bands[p.bands.length - 1] : { ...p.band, level: p.band.level ?? 0.9 };
  const half = (band.hi - band.lo) / 2 / p.prediction;
  const sd = half / normalQuantile(0.5 + (band.level ?? 0.9) / 2);
  return [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].flatMap((z) => [1 + z * sd, 1 - z * sd]);
}

/** Silverman's rule, floored so a handful of near-equal misses still gives a curve. */
export function bandwidth(xs: number[]): number {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(n - 1, 1));
  return Math.max(1.06 * sd * n ** -0.2, 0.004);
}

/** The curve at `points` ratios (normal kernel, unit area). */
export function density(xs: number[], points: number[]): number[] {
  const h = bandwidth(xs);
  const k = 1 / (xs.length * h * Math.sqrt(2 * Math.PI));
  return points.map((x) => k * xs.reduce((s, xi) => s + Math.exp(-0.5 * ((x - xi) / h) ** 2), 0));
}

/** Chance the final line ends at or below `ratio` x forecast. */
export function cdf(xs: number[], ratio: number): number {
  const h = bandwidth(xs);
  return xs.reduce((s, xi) => s + 0.5 * (1 + erf((ratio - xi) / (h * SQRT2))), 0) / xs.length;
}

function erf(x: number): number {                           // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-a * a);
  return s * y;
}

function normalQuantile(q: number): number {               // bisection on the cdf, good enough here
  let lo = -8, hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (0.5 * (1 + erf(mid / SQRT2)) < q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** "about 70%" style: a whole percent, held within 1-99 so it never claims certainty. */
export function chanceText(c: number): string {
  return `${Math.min(99, Math.max(1, Math.round(c * 100)))}%`;
}

/** The tier a score sits in: the smallest listed tier that contains it (top 0.89%
 *  is in the top 1%), the top tier above the curve, the last below it; 3% (or the
 *  first tier) with no score. */
export function tierFor(cells: Cell[], where: Placement | null): number {
  const pcts = cells.map((c) => c.percentile).sort((a, b) => a - b);
  if (!where) return pcts.includes(3) ? 3 : pcts[0];
  if (where.kind === "above") return pcts[0];
  if (where.kind === "below") return pcts[pcts.length - 1];
  return pcts.find((x) => x >= where.percentile - 1e-9) ?? pcts[pcts.length - 1];
}
