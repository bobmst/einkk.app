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
  state: { raid_day: number; hours_to_close: number; known_days: number; method: string };
  prediction: number;
  band: Band;
  cells?: Cell[];
  bands?: { level: number; lo: number; hi: number }[];   // narrowest first (contract 0.2.0)
  inputs: { anchors: { day: number; value: number }[] };
}

export interface HistoryEntry {
  season: number;
  server: Server;
  forecast?: number;
  band?: Band;
  grading?: { error_pct: number; hit: boolean } | null;
  final?: { value: number; source: "manual_collection" | "survey" | "reports"; n?: number };
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
