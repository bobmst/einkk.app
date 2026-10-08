// Number helpers shared by the forecast view and the report form.
import type { Lang } from "./i18n";
import type { Cell } from "./outbox";

/** Digits only, then grouped by thousands: "27635537449" -> "27,635,537,449". */
export function groupDigits(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A whole in-game score ("27,635,537,449") as 0.1B units (276.355…), or null. */
export function scoreToTenthB(input: string): number | null {
  const digits = input.replace(/\D/g, "");
  return digits ? Number(digits) / 1e8 : null;
}

/** Short axis label for a 0.1B value: "220" (亿/億/억) or "22B". */
export function axisDamage(lang: Lang, value: number): string {
  return lang === "en" ? `${(value / 10).toFixed(0)}B` : value.toFixed(0);
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
