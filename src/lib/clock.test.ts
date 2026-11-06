import { afterEach, describe, expect, it, vi } from "vitest";
import { freeze, frozenAt, now, viewFrom, viewKey } from "./clock";

afterEach(() => {
  freeze(null);
  vi.useRealTimers();
});

describe("the display clock", () => {
  it("is the real time unless frozen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-06T00:00:00Z"));
    expect(now()).toBe(Date.parse("2026-11-06T00:00:00Z"));
    expect(frozenAt()).toBeNull();
    freeze(Date.parse("2026-10-19T08:00:00Z"));
    vi.advanceTimersByTime(60_000);
    expect(now()).toBe(Date.parse("2026-10-19T08:00:00Z"));
    freeze(null);
    expect(now()).toBe(Date.parse("2026-11-06T00:01:00Z"));
  });
});

describe("the view a link asks for", () => {
  const search = "?frame=s42-d3-route-switch&at=2026-10-19T20:00:00Z";

  it("is ignored in production, whatever the link says", () => {
    expect(viewFrom("production", search)).toEqual({ frame: null, at: null });
    expect(viewFrom(undefined, search)).toEqual({ frame: null, at: null });
  });

  it("is honoured in rehearsal mode", () => {
    expect(viewFrom("rehearsal", search)).toEqual({ frame: "s42-d3-route-switch", at: Date.parse("2026-10-19T20:00:00Z") });
    expect(viewFrom("rehearsal", "?at=2026-10-20T05:00+09:00").at).toBe(Date.parse("2026-10-19T20:00:00Z"));
  });

  it("drops a frame id outside the contract and an unreadable time", () => {
    expect(viewFrom("rehearsal", "?frame=../season&at=soon")).toEqual({ frame: null, at: null });
    expect(viewFrom("rehearsal", "?frame=S42")).toEqual({ frame: null, at: null });
  });

  it("reads a frame's documents under its folder, and the real ones otherwise", () => {
    expect(viewKey({ frame: "s42-d3", at: null }, "predictions/s42/jp.json")).toBe("frames/s42-d3/predictions/s42/jp.json");
    expect(viewKey({ frame: null, at: 1 }, "season.json")).toBe("season.json");
  });
});
