// Number helpers shared by the forecast view and the report form.
import type { ChangeEvent } from "react";
import type { Lang } from "./i18n";
import type { Cell } from "./outbox";

/** Digits only, then grouped by thousands: "27635537449" -> "27,635,537,449". */
export function groupDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * An edited damage box regrouped, and where its caret goes: after as many
 * digits as it was after, so an edit mid-number doesn't throw the caret to the
 * end. Deleting only a comma deletes the digit beside it instead (the comma
 * would just come back).
 */
export function regroup(raw: string, caret: number, previous: string, inputType = ""):
  { value: string; caret: number } {
  let digits = raw.replace(/\D/g, "");
  let before = raw.slice(0, caret).replace(/\D/g, "").length;
  if (raw.length < previous.length && digits === previous.replace(/\D/g, "")) {
    if (inputType === "deleteContentForward") {
      digits = digits.slice(0, before) + digits.slice(before + 1);
    } else if (before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    }
  }
  const stripped = digits.replace(/^0+(?=\d)/, "");
  before = Math.max(0, before - (digits.length - stripped.length));
  const value = groupDigits(stripped);
  let at = 0;
  for (let seen = 0; at < value.length && seen < before; at++) if (/\d/.test(value[at])) seen++;
  return { value, caret: at };
}

/** onChange for a damage box: regroups it in place, keeps the caret, returns the new value. */
export function regroupField(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  previous: string): string {
  const input = e.target;
  const next = regroup(input.value, input.selectionStart ?? input.value.length, previous,
    (e.nativeEvent as InputEvent).inputType);
  // written now, React finds the box already showing its state and leaves the caret be
  input.value = next.value;
  input.setSelectionRange(next.caret, next.caret);
  return next.value;
}

/** A whole in-game score ("27,635,537,449") as 0.1B units (276.355…), or null. */
export function scoreToTenthB(input: string): number | null {
  const digits = input.replace(/\D/g, "");
  return digits ? Number(digits) / 1e8 : null;
}

/** Short axis label for a 0.1B value: "220" (亿/億/억) or "22B". */
export function axisDamage(lang: Lang, value: number): string {
  return lang === "en" || lang === "es" ? `${(value / 10).toFixed(0)}B` : value.toFixed(0);
}

export type Placement = { kind: "above" | "below"; percentile: number } | { kind: "at"; percentile: number };

/**
 * Where a damage (0.1B) lands on a server's curve: the percentile at which the
 * curve crosses it, interpolated in log(percentile) between the published
 * cells. Above the best cell or below the last one, says so instead.
 */
export function placement(cells: Cell[], value: number): Placement | null {
  const sorted = [...cells].sort((a, b) => a.percentile - b.percentile);
  if (sorted.length < 2) return null;
  if (value >= sorted[0].value) return { kind: "above", percentile: sorted[0].percentile };
  const last = sorted[sorted.length - 1];
  if (value < last.value) return { kind: "below", percentile: last.percentile };
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (value <= a.value && value >= b.value) {
      const t = a.value === b.value ? 0 : (a.value - value) / (a.value - b.value);
      const log = Math.log(a.percentile) + t * (Math.log(b.percentile) - Math.log(a.percentile));
      return { kind: "at", percentile: Math.exp(log) };
    }
  }
  return null;
}

// Share of its final 3% line the line has reached by the end of each raid day
// (n_k / n5, S41-like); in between, linear within the day.
const PATH = [0, 0.33, 0.63, 0.75, 0.88, 1];

/** How far the line has come, 0..1, at a raid day (1-5) and a share of that day; after the close 1. */
export function raidProgress(day: number, fraction: number): number {
  if (day < 1) return 0;
  if (day > 5) return 1;
  const f = Math.min(Math.max(fraction, 0), 1);
  return PATH[day - 1] + (PATH[day] - PATH[day - 1]) * f;
}

/** The curve's value at a rank percentile, interpolated in log(percentile); the nearest cell beyond them. */
export function valueAt(cells: Cell[], pc: number): number | null {
  const sorted = [...cells].sort((a, b) => a.percentile - b.percentile);
  if (sorted.length === 0) return null;
  if (pc <= sorted[0].percentile) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (pc >= last.percentile) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (pc >= a.percentile && pc <= b.percentile) {
      const t = (Math.log(pc) - Math.log(a.percentile)) / (Math.log(b.percentile) - Math.log(a.percentile));
      return a.value + t * (b.value - a.value);
    }
  }
  return null;
}

/**
 * A damage that looks a digit short or a digit long for its rank: "low" under a
 * third of where that rank's line should be by now (so day 1's small scores
 * never trip it), "high" over four times that rank's final forecast. A wrong
 * digit count is a factor of ten, so ordinary spread stays clear of both. A rank
 * past the curve's last cell isn't checked: the curve says nothing about it, and
 * the last cell's value would flag every ordinary score down there as short.
 */
export function digitCheck(cells: Cell[], pc: number, tenthB: number, progress: number): "low" | "high" | null {
  if (cells.length === 0 || pc > Math.max(...cells.map((c) => c.percentile))) return null;
  const expected = valueAt(cells, pc);
  if (!expected) return null;
  if (tenthB > 4 * expected) return "high";
  if (tenthB < (expected * progress) / 3) return "low";
  return null;
}
