import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSnapshot, saveSnapshot } from "./snapshot";

function memoryStorage() {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  });
  return items;
}

describe("snapshot", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the last loaded data with the time it was loaded", () => {
    memoryStorage();
    expect(loadSnapshot()).toBeNull();
    saveSnapshot({ season: { season: 42 } }, 1_000);
    expect(loadSnapshot()).toEqual({ saved_at: 1_000, data: { season: { season: 42 } } });
  });

  it("ignores what it can't read", () => {
    const items = memoryStorage();
    items.set("snapshot.v1", "{not json");
    expect(loadSnapshot()).toBeNull();
    items.set("snapshot.v1", JSON.stringify({ data: {} }));
    expect(loadSnapshot()).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("full"); },
    });
    expect(() => saveSnapshot({})).not.toThrow();
    expect(loadSnapshot()).toBeNull();
  });
});
