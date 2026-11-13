// #90: a document from a newer contract major than the page knows is set aside, never drawn.
import { describe, expect, it } from "vitest";
import { KNOWN_MAJOR, screenVersions, tooNew } from "./versions";

const next = `${KNOWN_MAJOR + 1}.0.0`;

describe("tooNew", () => {
  it("is only a higher major: a higher minor or patch reads as before", () => {
    expect(tooNew({ schema_version: next })).toBe(true);
    expect(tooNew({ schema_version: `${KNOWN_MAJOR}.99.0` })).toBe(false);
    expect(tooNew({ schema_version: `${KNOWN_MAJOR}.8.12` })).toBe(false);
    expect(tooNew({})).toBe(false);                                // none stated
    expect(tooNew(null)).toBe(false);
  });
});

describe("screenVersions", () => {
  const ok = { schema_version: "0.8.0" };
  it("sets a too-new document aside as null and says the page is outdated", () => {
    const out = screenVersions({
      season: { schema_version: next }, history: ok, finals: ok,
      predictions: { jp: ok, kr: { schema_version: next }, gb: null },
    });
    expect(out.outdated).toBe(true);
    expect(out.season).toBeNull();
    expect(out.history).toBe(ok);
    expect(out.predictions).toEqual({ jp: ok, kr: null, gb: null });   // null, still in the map
  });

  it("leaves current documents alone, and an unread finals unread", () => {
    const data = { season: ok, history: ok, predictions: { jp: ok } };
    const out = screenVersions(data);
    expect(out.outdated).toBe(false);
    expect(out).toEqual({ ...data, outdated: false });
    expect("finals" in out).toBe(false);
  });
});
