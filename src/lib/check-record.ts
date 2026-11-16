// #100: an anonymous record of the damages players look up in the checker during a live raid,
// and the hand-over from the checker's "What is your rank now?" to the report form.
//
// The checker itself stays entirely in the browser. Once a damage has stayed put for SETTLE_MS
// (never per keystroke), the page sends it to /api/checks once: a damage this browser already
// sent for the season and server within RESEND_HOURS is not sent again (the Worker dedupes as
// well). It is fire and forget: nothing waits on it, and every failure is silent, so the record
// can never block, slow or break the checker. The caller decides when the raid is live; on a
// frozen clock (src/lib/clock.ts) nothing is sent.
import type { Cell, Server } from "./outbox";

export const SETTLE_MS = 2500;
export const RESEND_HOURS = 6;
const KEY = "einkk.checks-sent";

interface Sent {
  season: number;
  at: Record<string, number>;              // "<server>:<damage>" -> when it was sent (ms)
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(store: Storage | null, season: number): Sent {
  try {
    const saved = JSON.parse(store?.getItem(KEY) ?? "null") as Sent | null;
    if (saved?.season === season && saved.at && typeof saved.at === "object") return saved;
  } catch {}
  return { season, at: {} };               // another season's, unreadable or none: start afresh
}

// sent in this tab: covers storage that is blocked or full
const memory = new Map<string, number>();

/**
 * A damage worth recording: within a factor of ten of the forecast's tiers. Keeps out a number
 * typed in the wrong units and a half-typed one the player paused on.
 */
export function plausible(cells: Cell[], damage: number): boolean {
  if (!cells.length || !(damage > 0)) return false;
  const values = cells.map((c) => c.value);
  return damage >= Math.min(...values) / 10 && damage <= Math.max(...values) * 10;
}

/**
 * Send one checked damage unless it was sent recently. Returns whether a request went out.
 * Never throws and never waits for the answer.
 */
export function recordCheck(check: { season: number; server: Server; damage: number },
  deps: { fetch?: typeof fetch; store?: Storage | null; now?: number } = {}): boolean {
  const now = deps.now ?? Date.now();
  const store = deps.store === undefined ? storage() : deps.store;
  const id = `${check.server}:${check.damage}`;
  const sent = read(store, check.season);
  const last = Math.max(sent.at[id] ?? 0, memory.get(`${check.season}:${id}`) ?? 0);
  if (now - last < RESEND_HOURS * 3_600_000) return false;

  // marked before sending: a failed request is not tried again, so one damage is one request
  memory.set(`${check.season}:${id}`, now);
  const fresh = Object.fromEntries(Object.entries(sent.at).filter(([, t]) => now - t < RESEND_HOURS * 3_600_000));
  try {
    store?.setItem(KEY, JSON.stringify({ season: check.season, at: { ...fresh, [id]: now } }));
  } catch {}
  try {
    const send = deps.fetch ?? fetch;
    void send("/api/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(check),
      keepalive: true,                     // still goes out if the tab closes right after
    }).catch(() => {});
  } catch {}
  return true;
}

// The checker's damage, handed to the in-raid report form ("What is your rank now?").
const listeners = new Set<() => void>();
let pending: string | null = null;

export const reportPrefill = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get: (): string | null => pending,
  /** The damage as typed in the checker; the form takes it into its damage field. */
  set(score: string) {
    pending = score;
    listeners.forEach((listener) => listener());
  },
  /** The form has taken it. */
  clear() {
    pending = null;
    listeners.forEach((listener) => listener());
  },
};

/** For tests: forget what this tab sent. */
export function resetMemory() {
  memory.clear();
}
