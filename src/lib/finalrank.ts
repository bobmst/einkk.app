// Where the player's current in-game rank is likely to be at the close, if the score
// stays (#68). The engine works this out and publishes it with each forecast as a table
// per start rank (Prediction.rank_slide, contract 0.7.0); this file only reads that
// table: it interpolates between rows and turns the range into a chance per tier.
import type { Prediction } from "./outbox";

export type FinalRank = { median: number; lo: number; hi: number; level: number; mu: number; sd: number };

/** The table's row at `pc`%, interpolated in log rank; null without a table or outside
 *  the ranks it covers (never extrapolated). */
export function finalRank(p: Prediction, pc: number): FinalRank | null {
  const s = p.rank_slide;
  if (!s || !(pc > 0) || s.rows.length < 2) return null;
  const rows = [...s.rows].sort((a, b) => a.rank_pc - b.rank_pc);
  if (pc < rows[0].rank_pc || pc > rows[rows.length - 1].rank_pc) return null;
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1].rank_pc < pc) i++;
  const [a, b] = [rows[i], rows[i + 1]];
  const w = (Math.log(pc) - Math.log(a.rank_pc)) / (Math.log(b.rank_pc) - Math.log(a.rank_pc));
  const at = (k: "median" | "lo" | "hi") => Math.exp(Math.log(a[k]) + w * (Math.log(b[k]) - Math.log(a[k])));
  const [median, lo, hi] = [at("median"), at("lo"), at("hi")];
  const sd = (Math.log(hi) - Math.log(lo)) / (2 * normalQuantile(0.5 + s.level / 2));
  return { median, lo, hi, level: s.level, mu: Math.log(median), sd: Math.max(sd, 1e-6) };
}

/** Chance the rank is still within the top `tier`% at the close (log-normal through the range). */
export function stayChance(f: FinalRank, tier: number): number {
  return 0.5 * (1 + erf((Math.log(tier) - f.mu) / (f.sd * Math.SQRT2)));
}

function erf(x: number): number {                           // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t
    + 0.254829592) * t * Math.exp(-a * a));
}

function normalQuantile(q: number): number {               // bisection on the cdf
  let lo = -8, hi = 8;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (0.5 * (1 + erf(mid / Math.SQRT2)) < q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
