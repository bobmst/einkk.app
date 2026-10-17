import { describe, expect, it } from "vitest";
import { finalWindowOpen, previousFinalOpen, stateAt, surveyLink, type Season } from "./outbox";

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
