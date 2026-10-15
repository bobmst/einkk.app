import { describe, expect, it } from "vitest";
import { finalWindowOpen, stateAt, type Season } from "./outbox";

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
