// When the page checks the outbox again (#86). Every /api request runs the Worker,
// and the free plan stops /api/* at 100k a day, so a tab asks only when the engine
// can have published something new:
//
// - the followed server's forecast: in a raid, at the engine's interval
//   (PREDICT_INTERVAL_MIN, 30 by default), on the grid of the last forecast's
//   issued_at, a little after the next run should have published. Before a raid
//   the engine forecasts once a day (05:02 JST), so the page checks once a day,
//   after that run. After the close the forecast is no longer shown: no checks.
// - season.json: once on open; then only at the moments its state turns (start,
//   close, settle, end of final results), a little after them so the engine's run
//   has written the change, and when a forecast names another season (the page
//   then reloads everything).
// - history.json: once on open.
// - finals/s<n>.json, from the close: every 30 minutes until the results settle,
//   every 4 hours after.
// Each check waits a fixed share of a few minutes, drawn once per tab, so tabs
// opened together don't all ask at once. A hidden tab asks for nothing; it catches
// up when shown (the dashboard does that).
import { FINAL_WINDOW_MS, throughMinute } from "./windows";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** The engine's interval in a raid (solo_raid_predict PREDICT_INTERVAL_MIN, default 30). */
export const LIVE_PERIOD_MS = 30 * MINUTE;
/** The engine's daily run, 05:02 JST, in minutes after 00:00 UTC. */
export const DAILY_RUN_UTC_MIN = 20 * 60 + 2;
/** How long after a run is due the page looks: the run's own minutes, plus the tab's jitter. */
export const RUN_DELAY_MS = 4 * MINUTE;
export const JITTER_MS = 4 * MINUTE;
/** A turn of the season: the page looks again once the engine's next run has written it. */
export const TURN_DELAY_MS = 15 * MINUTE;
export const FINALS_UNSETTLED_MS = 30 * MINUTE;
export const FINALS_SETTLED_MS = 4 * HOUR;
/** No season document at all: look once a day for one. */
export const NO_SEASON_MS = 24 * HOUR;
export const RETRY_MS = MINUTE;

export type Kind = "season" | "prediction" | "finals";

export interface SeasonTimes {
  season: number;
  starts_at: string | null;
  ends_at: string | null;
  state: "upcoming" | "live" | "measuring" | "closed";
  survey?: { closes_at: string } | null;
  finals_close_at?: string;
}

export interface Known {
  season: SeasonTimes | null;
  /** issued_at of the followed server's forecast, when one is published. */
  issuedAt: string | null;
  /** settles_at and settled of this season's finals, once read. */
  finals: { settles_at: string; settled: boolean } | null;
  /** When each was last read (ms); finals null until first read. */
  fetched: { season: number; prediction: number; finals: number | null };
}

export type Due = Record<Kind, number | null>;

/** The season's state by the clock (src/lib/outbox.ts stateAt, without the import cycle). */
function state(season: SeasonTimes, now: number): SeasonTimes["state"] {
  if (!season.starts_at || !season.ends_at || now < Date.parse(season.starts_at)) return "upcoming";
  if (now < throughMinute(season.ends_at)) return "live";
  return season.state === "closed" ? "closed" : "measuring";
}

/** The instants the season's state turns at, earliest first: start, close, settle, end of final results. */
export function turns(season: SeasonTimes, finals: Known["finals"]): number[] {
  const out: number[] = [];
  if (season.starts_at) out.push(Date.parse(season.starts_at));
  if (season.ends_at) {
    out.push(throughMinute(season.ends_at));
    if (finals) out.push(Date.parse(finals.settles_at));
    // the end of final results, as src/lib/windows.ts inFinalWindow ends them
    let end = season.survey?.closes_at ? throughMinute(season.survey.closes_at)
      : Date.parse(season.ends_at) + FINAL_WINDOW_MS;
    if (season.finals_close_at) end = Math.min(end, throughMinute(season.finals_close_at));
    out.push(end);
  }
  return out.filter(Number.isFinite).sort((a, b) => a - b);
}

/** The next daily engine run after `t`. */
function nextDailyRun(t: number): number {
  const day = Math.floor(t / (24 * HOUR)) * 24 * HOUR;
  const run = day + DAILY_RUN_UTC_MIN * MINUTE;
  return run > t ? run : run + 24 * HOUR;
}

/**
 * When each document is next due, given what the page holds, at `now`. `jitter` in
 * [0, 1) is the tab's own share of JITTER_MS. null: not checked again by time.
 */
export function plan(known: Known, now: number, jitter: number): Due {
  const wait = jitter * JITTER_MS;
  const season = known.season;
  if (!season) return { season: known.fetched.season + NO_SEASON_MS, prediction: null, finals: null };

  const turn = turns(season, known.finals).find((t) => t + TURN_DELAY_MS + wait > known.fetched.season);
  const seasonDue = turn === undefined ? null : turn + TURN_DELAY_MS + wait;

  const st = state(season, now);
  let prediction: number | null = null;
  if (st === "live") {
    // on the grid of the last forecast, the first run after the last check
    const base = known.issuedAt ? Date.parse(known.issuedAt) : known.fetched.prediction;
    const after = known.fetched.prediction - RUN_DELAY_MS - wait;
    const steps = Math.max(1, Math.floor((after - base) / LIVE_PERIOD_MS) + 1);
    prediction = base + steps * LIVE_PERIOD_MS + RUN_DELAY_MS + wait;
  } else if (st === "upcoming") {
    prediction = nextDailyRun(known.fetched.prediction - RUN_DELAY_MS - wait) + RUN_DELAY_MS + wait;
  }

  let finals: number | null = null;
  if (st === "measuring" || st === "closed") {
    if (known.fetched.finals === null) {
      finals = (season.ends_at ? throughMinute(season.ends_at) : now) + TURN_DELAY_MS + wait;
    } else {
      const settled = known.finals?.settled || (known.finals !== null && now >= Date.parse(known.finals.settles_at));
      finals = known.fetched.finals + (settled ? FINALS_SETTLED_MS : FINALS_UNSETTLED_MS);
    }
  }
  return { season: seasonDue, prediction, finals };
}

/** The earliest due time, or null when nothing is due by time. */
export function nextDue(due: Due): number | null {
  const times = Object.values(due).filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}
