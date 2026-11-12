// #86: how many requests one open tab makes per hour in each state of the season.
// The engine and the page run the same clock here: a forecast published on the
// raid's 30-minute grid, finals settling 12 hours after the close. Pinned so a
// change that makes the page ask more often fails here first.
import { describe, expect, it } from "vitest";
import { FINALS_SETTLED_MS, HOUR, LIVE_PERIOD_MS, MINUTE, nextDue, plan, type Kind, type Known,
  type SeasonTimes } from "./refresh";

const SEASON: SeasonTimes = {
  season: 43, starts_at: "2026-11-13T20:00:00Z", ends_at: "2026-11-18T19:59:00Z", state: "live",
  survey: null,
};
const START = Date.parse(SEASON.starts_at as string);
const CLOSE = Date.parse("2026-11-18T20:00:00Z");
const SETTLES = CLOSE + 12 * HOUR;

/** The engine's last forecast at `t`: published on the grid from the start, 3 minutes into each run. */
function issuedAt(t: number): string {
  const grid = t < START ? START - 24 * HOUR : START + Math.floor((t - START - 3 * MINUTE) / LIVE_PERIOD_MS) * LIVE_PERIOD_MS;
  return new Date(Math.min(grid, CLOSE) + 3 * MINUTE).toISOString();
}

/** Counts of the page's checks over `hours` from `from`, opened at `from` (the open itself not counted). */
function simulate(from: number, hours: number, jitter = 0.5): Record<Kind, number> {
  const ended = from >= CLOSE;
  const finals = (t: number) => ({ settles_at: new Date(SETTLES).toISOString(), settled: t >= SETTLES });
  const known: Known = {
    season: { ...SEASON, state: ended ? "measuring" : SEASON.state },
    issuedAt: issuedAt(from),
    finals: ended ? finals(from) : null,
    fetched: { season: from, prediction: from, finals: ended ? from : null },
  };
  const counts: Record<Kind, number> = { season: 0, prediction: 0, finals: 0 };
  const end = from + hours * HOUR;
  for (let t = from, guard = 0; guard < 10_000; guard++) {
    const next = nextDue(plan(known, t, jitter));
    if (next === null || next > end) break;
    t = Math.max(t, next);
    const due = plan(known, t, jitter);
    for (const kind of ["season", "prediction", "finals"] as Kind[]) {
      if (due[kind] === null || (due[kind] as number) > t) continue;
      counts[kind]++;
      known.fetched[kind] = t;
      if (kind === "prediction") known.issuedAt = issuedAt(t);
      if (kind === "finals") known.finals = finals(t);
    }
  }
  return counts;
}

describe("requests per open tab", () => {
  it("upcoming: one forecast check a day, after the engine's daily run", () => {
    expect(simulate(Date.parse("2026-11-12T00:00:00Z"), 24)).toEqual({ season: 0, prediction: 1, finals: 0 });
  });

  it("live: the followed forecast at the engine's interval, two an hour, nothing else", () => {
    const c = simulate(Date.parse("2026-11-15T00:07:00Z"), 24);
    // 24 hours from 00:07 holds the checks 00:39 .. 23:39: 47 (was 3 requests every 5 minutes, 36 an hour)
    expect(c).toEqual({ season: 0, prediction: 47, finals: 0 });
  });

  it("live: each check lands after the run it waits for, not before", () => {
    const from = Date.parse("2026-11-15T00:07:00Z");
    const known: Known = { season: SEASON, issuedAt: issuedAt(from), finals: null,
      fetched: { season: from, prediction: from, finals: null } };
    const due = plan(known, from, 0).prediction as number;
    expect(due).toBeGreaterThan(Date.parse(issuedAt(from)) + LIVE_PERIOD_MS);
    expect(due).toBeLessThan(Date.parse(issuedAt(from)) + LIVE_PERIOD_MS + 10 * MINUTE);
  });

  it("open across the start: one season check after it, then the live cadence", () => {
    const c = simulate(START - 2 * HOUR, 4);
    expect(c.season).toBe(1);
    expect(c.prediction).toBeGreaterThanOrEqual(3);                 // the daily run, then the raid's grid
    expect(c.prediction).toBeLessThanOrEqual(5);
    expect(c.finals).toBe(0);
  });

  it("closed, not settled: finals every 30 minutes, no forecast", () => {
    expect(simulate(CLOSE + HOUR, 6)).toEqual({ season: 0, prediction: 0, finals: 12 });
  });

  it("open across the settle: one season check after it, then finals every 4 hours", () => {
    const c = simulate(SETTLES - HOUR, 24);
    expect(c.season).toBe(1);
    expect(c.prediction).toBe(0);
    expect(c.finals).toBeLessThanOrEqual(2 + 24 / (FINALS_SETTLED_MS / HOUR));
  });

  it("settled: finals every 4 hours", () => {
    expect(simulate(SETTLES + HOUR, 24)).toEqual({ season: 0, prediction: 0, finals: 6 });
  });

  it("no season document: one look a day", () => {
    const from = Date.parse("2026-11-12T00:00:00Z");
    const known: Known = { season: null, issuedAt: null, finals: null,
      fetched: { season: from, prediction: from, finals: null } };
    expect(nextDue(plan(known, from, 0.5))).toBe(from + 24 * HOUR);
  });

  it("tabs spread their checks: the same plan, different jitter, different times", () => {
    const from = Date.parse("2026-11-15T00:07:00Z");
    const known: Known = { season: SEASON, issuedAt: issuedAt(from), finals: null,
      fetched: { season: from, prediction: from, finals: null } };
    expect(plan(known, from, 0).prediction).not.toBe(plan(known, from, 0.9).prediction);
  });
});
