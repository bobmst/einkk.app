// @vitest-environment jsdom
// On uat the preview shares its origin with the rehearsal page: a fixture written on the view
// page must stay in that tab, and only the review marks reach the real storage.
import { describe, expect, it } from "vitest";
import { readMarks, setMark } from "./review";
import { isolateStorage, realStorage } from "./storage";

describe("isolateStorage", () => {
  it("keeps the view page's writes in memory and the marks in the real storage", () => {
    const real = window.localStorage;
    real.setItem("einkk.last-report", "the player's own");

    isolateStorage();
    expect(window.localStorage).not.toBe(real);
    expect(localStorage.getItem("einkk.last-report")).toBeNull();      // starts empty
    localStorage.setItem("einkk.last-report", "a fixture's");
    localStorage.setItem("snapshot.v1", "{}");
    expect(localStorage.getItem("einkk.last-report")).toBe("a fixture's");
    expect(localStorage.length).toBe(2);
    localStorage.removeItem("snapshot.v1");
    expect(localStorage.key(0)).toBe("einkk.last-report");

    expect(real.getItem("einkk.last-report")).toBe("the player's own");
    expect(real.getItem("snapshot.v1")).toBeNull();

    setMark({ state: "live", lang: "en", theme: "light" }, "ok");
    expect(realStorage()).toBe(real);
    expect(JSON.parse(real.getItem("einkk.states-review") ?? "{}")).toEqual({ "live|en|light": "ok" });
    expect(readMarks()).toEqual({ "live|en|light": "ok" });
    expect(localStorage.getItem("einkk.states-review")).toBeNull();

    isolateStorage();                                                     // a second call is a no-op
    expect(localStorage.getItem("einkk.last-report")).toBe("a fixture's");
  });
});
