// #100: the checker's anonymous record, from the page's side.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { plausible, recordCheck, reportPrefill, resetMemory, RESEND_HOURS } from "./check-record";

function memory(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => { items.delete(k); },
    setItem: (k, v) => { items.set(k, String(v)); },
  };
}
const blocked = (): Storage => {
  const no = () => { throw new DOMException("blocked", "SecurityError"); };
  return { length: 0, clear: no, getItem: no, key: no, removeItem: no, setItem: no };
};

const T0 = Date.parse("2026-11-15T03:00:00Z");
const ok = () => vi.fn(async () => new Response(null, { status: 201 }));
const check = { season: 43, server: "jp" as const, damage: 233.53 };

beforeEach(() => resetMemory());

describe("recordCheck", () => {
  it("sends one request with the season, server and damage only", () => {
    const fetch = ok();
    expect(recordCheck(check, { fetch, store: memory(), now: T0 })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/checks");
    expect(JSON.parse(init.body as string)).toEqual(check);
  });

  it("doesn't send the same damage again within the window, even from a new tab", () => {
    const fetch = ok();
    const store = memory();
    recordCheck(check, { fetch, store, now: T0 });
    resetMemory();                                             // a new tab: only storage remembers
    expect(recordCheck(check, { fetch, store, now: T0 + 3_600_000 })).toBe(false);
    expect(recordCheck({ ...check, server: "kr" }, { fetch, store, now: T0 })).toBe(true);
    expect(recordCheck({ ...check, damage: 240 }, { fetch, store, now: T0 })).toBe(true);
    expect(recordCheck(check, { fetch, store, now: T0 + RESEND_HOURS * 3_600_000 })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("starts afresh for a new season", () => {
    const fetch = ok();
    const store = memory();
    recordCheck(check, { fetch, store, now: T0 });
    expect(recordCheck({ ...check, season: 44 }, { fetch, store, now: T0 })).toBe(true);
  });

  it("stays silent when the request fails or fetch throws, and doesn't retry", async () => {
    const store = memory();
    const rejecting = vi.fn(async () => { throw new TypeError("offline"); });
    expect(recordCheck(check, { fetch: rejecting, store, now: T0 })).toBe(true);
    await Promise.resolve();
    const throwing = vi.fn(() => { throw new Error("no fetch"); }) as unknown as typeof fetch;
    expect(() => recordCheck({ ...check, damage: 1 }, { fetch: throwing, store, now: T0 })).not.toThrow();
    expect(recordCheck(check, { fetch: rejecting, store, now: T0 + 1000 })).toBe(false);
    expect(rejecting).toHaveBeenCalledTimes(1);
  });

  it("remembers in the tab when storage is blocked", () => {
    const fetch = ok();
    expect(recordCheck(check, { fetch, store: blocked(), now: T0 })).toBe(true);
    expect(recordCheck(check, { fetch, store: blocked(), now: T0 + 1000 })).toBe(false);
    expect(recordCheck(check, { fetch, store: null, now: T0 + 2000 })).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("plausible", () => {
  const cells = [{ percentile: 1, value: 300 }, { percentile: 3, value: 250 }, { percentile: 10, value: 180 }];
  it("takes a damage near the tiers and refuses wrong units or a half-typed number", () => {
    expect(plausible(cells, 233.5)).toBe(true);
    expect(plausible(cells, 18)).toBe(true);
    expect(plausible(cells, 17.9)).toBe(false);                 // a digit or more short
    expect(plausible(cells, 3001)).toBe(false);
    expect(plausible([], 233)).toBe(false);
    expect(plausible(cells, 0)).toBe(false);
  });
});

describe("reportPrefill", () => {
  it("hands the checker's damage to the form once", () => {
    const heard = vi.fn();
    const stop = reportPrefill.subscribe(heard);
    reportPrefill.set("23,353,143,363");
    expect(reportPrefill.get()).toBe("23,353,143,363");
    reportPrefill.clear();
    expect(reportPrefill.get()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
  });
});
