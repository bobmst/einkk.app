// The engine's outbox documents as the page reads them (contracts/*.schema.json),
// fetched through the Worker's read API. Only the fields the page uses are typed.
import { inFinalWindow, throughMinute } from "./windows";

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
  survey: Survey | null;
  // the season before, while it may still take final results (contract 0.2.0)
  previous?: PreviousSeason;
}

export interface Survey {
  url: string;
  opens_at: string;
  closes_at: string;
}

export interface PreviousSeason {
  season: number;
  starts_at: string;
  ends_at: string;
  survey: Survey | null;
}

/**
 * The season's state at `now`. The document is a snapshot from the engine's last
 * run, which can lag the raid's open and close by up to a run interval, while the
 * Worker takes reports by the clock; so the clock decides upcoming / live / ended,
 * and after the close the document only tells measuring from closed.
 */
export function stateAt(season: Season, now: number): Season["state"] {
  if (now < Date.parse(season.starts_at)) return "upcoming";
  if (now < throughMinute(season.ends_at)) return "live";
  return season.state === "closed" ? "closed" : "measuring";
}

/** The window the Worker takes final results in (src/lib/windows.ts), by the clock. */
export function finalWindowOpen(season: Season | PreviousSeason, now: number): boolean {
  return inFinalWindow({ ...season, survey_closes_at: season.survey?.closes_at }, now);
}

/**
 * The season before the published one while its final window is still open. The
 * engine publishes the next season inside that window, so the page keeps offering
 * the closing season's final results beside it, as the Worker keeps taking them.
 */
export function previousFinalOpen(season: Season, now: number): PreviousSeason | null {
  const previous = season.previous;
  return previous && previous.season < season.season && finalWindowOpen(previous, now) ? previous : null;
}

/** A survey link the page may show at `now`: only a Tally form, only once it has opened. */
export function surveyLink(survey: Survey | null, now: number): string | null {
  return survey?.url.startsWith("https://tally.so/") && now >= Date.parse(survey.opens_at) ? survey.url : null;
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
  // reference only, never used by the forecast: this server's final line with today's reports (contract 0.5.0)
  shadow_nowcast?: { day: number; final: number; reports_used: number; servers: Partial<Record<Server, number>> };
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

/** A server's latest forecast for a season: absent from a map until fetched, null when none is published. */
export type Predictions = Partial<Record<Server, Prediction | null>>;

export const predictionKey = (season: number, server: Server) => `predictions/s${season}/${server}.json`;

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
