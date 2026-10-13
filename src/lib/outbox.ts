// The engine's outbox documents as the page reads them (contracts/*.schema.json),
// fetched through the Worker's read API. Only the fields the page uses are typed.

export const SERVERS = ["jp", "kr", "na", "sea", "tw", "gb"] as const;
export type Server = (typeof SERVERS)[number];
export type Element = "fire" | "water" | "wind" | "iron" | "electronic";

export interface Health {
  ok: boolean;
  intake: boolean;
  mode?: string;
  turnstile_site_key?: string;
}

export interface Season {
  issued_at: string;
  season: number;
  boss: { name: string; element: Element; weakness?: Element };
  starts_at: string;
  ends_at: string;
  state: "upcoming" | "live" | "measuring" | "closed";
  survey: { url: string; opens_at: string; closes_at: string } | null;
}

// Final results are taken from the close through the survey window's end; before
// the form exists, END 05:00 JST + 20 days at 23:59 JST (worker/season.ts).
const FINAL_WINDOW_MS = (20 * 24 + 19) * 3_600_000 + 60_000;

export function finalWindowOpen(season: Season, now: number): boolean {
  if (season.state !== "measuring" && season.state !== "closed") return false;
  const open = Date.parse(season.ends_at) + 60_000;
  const close = season.survey ? Date.parse(season.survey.closes_at) + 60_000 : Date.parse(season.ends_at) + FINAL_WINDOW_MS;
  return now >= open && now < close;
}

export interface Band {
  lo: number;
  hi: number;
  level: number | null;
  method: string;
}

export interface Cell {
  percentile: number;
  value: number;
  lo?: number;
  hi?: number;
  extrapolated?: boolean;
}

export interface Prediction {
  revision: number;
  issued_at: string;
  season: number;
  server: Server;
  model_version: string;
  state: { raid_day: number; day_fraction?: number; hours_to_close: number; known_days: number; method: string };
  prediction: number;
  band: Band;
  cells?: Cell[];
  bands?: { level: number; lo: number; hi: number }[];   // narrowest first (contract 0.2.0)
  residuals?: { season: number; error_pct: number }[];   // the misses the bands come from (contract 0.3.0)
  inputs: { anchors: { day: number; value: number }[] };
  // reference only, never used by the forecast (contract 0.4.0)
  shadow_nowcast?: { day: number; estimate: number; lo: number; hi: number; model_expects: number;
    reports_used: number; servers: Partial<Record<Server, number>> };
}

export interface HistoryEntry {
  season: number;
  server: Server;
  forecast?: number;
  band?: Band;
  grading?: { error_pct: number; hit: boolean | null } | null;   // hit null: no band posted (contract 0.2.0)
  final?: { value: number; source: "manual_collection" | "survey" | "reports" | "survey_and_reports"; n?: number;
    estimate?: boolean };   // estimate: read off the curve, no report near 3% (contract 0.3.0)
}

export interface History {
  issued_at: string;
  entries: HistoryEntry[];
}

/** One outbox document, or null when it isn't published (404). */
export async function outbox<T>(key: string): Promise<T | null> {
  const response = await fetch(`/api/outbox/${key}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export async function health(): Promise<Health | null> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    return response.ok ? ((await response.json()) as Health) : null;
  } catch {
    return null;
  }
}
