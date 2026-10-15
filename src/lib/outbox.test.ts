import { afterEach, describe, expect, it, vi } from "vitest";
import { FETCH_TIMEOUT_MS, finalWindowOpen, health, latestPrediction, outbox, previousFinalOpen, stateAt, surveyLink,
  type Season } from "./outbox";

const season: Season = {
  issued_at: "2026-10-31T00:00:00Z", season: 42, boss: { name: "Altruia", element: "water" },
  starts_at: "2026-10-16T20:00:00Z", ends_at: "2026-10-21T19:59:00Z", state: "measuring", survey: null,
};

describe("finalWindowOpen", () => {
  it("opens at the close and runs to END + 20 days 23:59 JST before the survey exists", () => {
    expect(finalWindowOpen(season, Date.parse("2026-10-21T19:59:59Z"))).toBe(false);
    expect(finalWindowOpen(season, Date.parse("2026-10-21T20:00:00Z"))).toBe(true);
    expect(finalWindowOpen(season, Date.parse("2026-11-11T14:59:59Z"))).toBe(true);
    expect(finalWindowOpen(season, Date.parse("2026-11-11T15:00:00Z"))).toBe(false);
  });

  it("follows the survey's own close once the form exists", () => {
    const withSurvey = { ...season, survey: { url: "https://tally.so/r/x", opens_at: "2026-10-21T20:00:00Z",
      closes_at: "2026-11-05T14:59:00Z" } };
    expect(finalWindowOpen(withSurvey, Date.parse("2026-11-05T14:59:30Z"))).toBe(true);
    expect(finalWindowOpen(withSurvey, Date.parse("2026-11-05T15:00:00Z"))).toBe(false);
  });

  it("is shut while the raid is upcoming or live", () => {
    expect(finalWindowOpen({ ...season, state: "upcoming" }, Date.parse("2026-10-16T19:00:00Z"))).toBe(false);
    expect(finalWindowOpen({ ...season, state: "live" }, Date.parse("2026-10-19T00:00:00Z"))).toBe(false);
  });

  it("opens at the close even before the engine has republished the season as measuring", () => {
    expect(finalWindowOpen({ ...season, state: "live" }, Date.parse("2026-10-21T20:10:00Z"))).toBe(true);
  });
});

describe("stateAt", () => {
  it("follows the clock across the open and the close, whatever the snapshot says", () => {
    const stale = { ...season, state: "upcoming" as const };
    expect(stateAt(stale, Date.parse("2026-10-16T19:59:59Z"))).toBe("upcoming");
    expect(stateAt(stale, Date.parse("2026-10-16T20:00:00Z"))).toBe("live");
    expect(stateAt({ ...season, state: "live" }, Date.parse("2026-10-21T19:59:59Z"))).toBe("live");
    expect(stateAt({ ...season, state: "live" }, Date.parse("2026-10-21T20:00:00Z"))).toBe("measuring");
  });

  it("keeps the document's closed once the final line is in", () => {
    expect(stateAt({ ...season, state: "closed" }, Date.parse("2026-10-25T00:00:00Z"))).toBe("closed");
    expect(stateAt(season, Date.parse("2026-10-25T00:00:00Z"))).toBe("measuring");
  });
});

describe("outbox fetches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  // a fetch that never answers, until its signal aborts it
  const hang = (_: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

  it("returns the document, or null when it isn't published", async () => {
    const fetch = vi.fn(async (path: string) => (path.endsWith("season.json") ? json({ season: 42 }) : json({}, 404)));
    vi.stubGlobal("fetch", fetch);
    expect(await outbox("season.json")).toEqual({ season: 42 });
    expect(await outbox("history.json")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("asks the latest route for the followed server's forecast", async () => {
    const fetch = vi.fn(async (_path: string) => json({ season: 42, server: "kr" }));
    vi.stubGlobal("fetch", fetch);
    expect(await latestPrediction("kr")).toEqual({ season: 42, server: "kr" });
    expect(fetch.mock.calls[0][0]).toBe("/api/latest/kr.json");
  });

  it("tries a failed or 5xx request once more, and gives up after that", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal("fetch", flaky);
    expect(await outbox("season.json")).toEqual({ ok: 1 });
    const down = vi.fn(async () => json({}, 503));
    vi.stubGlobal("fetch", down);
    await expect(outbox("season.json")).rejects.toThrow("HTTP 503");
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry a 4xx other than 404", async () => {
    const bad = vi.fn(async () => json({}, 400));
    vi.stubGlobal("fetch", bad);
    await expect(outbox("season.json")).rejects.toThrow("HTTP 400");
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("gives up on a hanging request after the timeout, tries once more, then fails", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(hang);
    vi.stubGlobal("fetch", fetch);
    const result = outbox("season.json").catch((e: Error) => e.name);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    expect(await result).toBe("AbortError");
  });

  it("recovers when the retry answers in time", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementationOnce(hang).mockResolvedValueOnce(json({ season: 42 }));
    vi.stubGlobal("fetch", fetch);
    const result = outbox("season.json");
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    expect(await result).toEqual({ season: 42 });
  });

  it("reads health as null when it can't be had", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 503)));
    expect(await health()).toBeNull();
  });
});

describe("previousFinalOpen", () => {
  // S43 published while S42's final window (to 11/11 23:59 JST) is still open
  const next: Season = {
    ...season, season: 43, starts_at: "2026-11-13T20:00:00Z", ends_at: "2026-11-18T19:59:00Z", state: "upcoming",
    previous: { season: 42, starts_at: season.starts_at, ends_at: season.ends_at, survey: null },
  };

  it("offers the previous season's final results through its own window", () => {
    expect(previousFinalOpen(next, Date.parse("2026-11-05T00:00:00Z"))?.season).toBe(42);
    expect(previousFinalOpen(next, Date.parse("2026-11-11T14:59:59Z"))?.season).toBe(42);
    expect(previousFinalOpen(next, Date.parse("2026-11-11T15:00:00Z"))).toBeNull();
  });

  it("follows the previous survey's closes_at once its form exists", () => {
    const survey = { url: "https://tally.so/r/abc", opens_at: "2026-10-21T20:00:00Z", closes_at: "2026-11-08T14:59:00Z" };
    const doc = { ...next, previous: { ...next.previous!, survey } };
    expect(previousFinalOpen(doc, Date.parse("2026-11-08T14:59:30Z"))?.season).toBe(42);
    expect(previousFinalOpen(doc, Date.parse("2026-11-08T15:00:00Z"))).toBeNull();
  });

  it("offers nothing without `previous`, or with one that isn't older", () => {
    expect(previousFinalOpen({ ...next, previous: undefined }, Date.parse("2026-11-05T00:00:00Z"))).toBeNull();
    const bad = { ...next, previous: { ...next.previous!, season: 43 } };
    expect(previousFinalOpen(bad, Date.parse("2026-11-05T00:00:00Z"))).toBeNull();
  });
});

describe("surveyLink", () => {
  const survey = { url: "https://tally.so/r/abc", opens_at: "2026-10-21T20:00:00Z", closes_at: "2026-11-08T14:59:00Z" };

  it("links a Tally form once it has opened", () => {
    expect(surveyLink(survey, Date.parse("2026-10-21T19:59:59Z"))).toBeNull();
    expect(surveyLink(survey, Date.parse("2026-10-21T20:00:00Z"))).toBe(survey.url);
  });

  it("never links anything but Tally", () => {
    expect(surveyLink({ ...survey, url: "https://example.com/form" }, Date.parse("2026-11-01T00:00:00Z"))).toBeNull();
    expect(surveyLink(null, Date.parse("2026-11-01T00:00:00Z"))).toBeNull();
  });
});
