// #98: the remembered in-raid report behind the one-tap re-report.
import { describe, expect, it, vi } from "vitest";
import { lastReport } from "./last-report";

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

function blocked(): Storage {
  const no = () => { throw new DOMException("blocked", "SecurityError"); };
  return { length: 0, clear: no, getItem: no, key: no, removeItem: no, setItem: no };
}

describe("the remembered report", () => {
  it("offers the damage last sent for the season and server, the last one per server", () => {
    const store = memory();
    expect(lastReport.get(43, "jp", store)).toBeNull();
    lastReport.set(43, "jp", "23,353,143,363", store);
    lastReport.set(43, "na", "19,000,000,000", store);
    lastReport.set(43, "jp", "24,100,000,000", store);          // a second account, or a new damage
    expect(lastReport.get(43, "jp", store)).toBe("24,100,000,000");
    expect(lastReport.get(43, "na", store)).toBe("19,000,000,000");
    expect(lastReport.get(43, "kr", store)).toBeNull();
  });

  it("is cleared when the season changes", () => {
    const store = memory();
    lastReport.set(43, "jp", "23,353,143,363", store);
    expect(lastReport.get(44, "jp", store)).toBeNull();
    expect(lastReport.get(43, "jp", store)).toBeNull();          // gone, not just hidden
    lastReport.set(43, "jp", "1", store);
    lastReport.set(44, "gb", "2", store);                       // a new season's report replaces it
    expect(lastReport.get(44, "jp", store)).toBeNull();
    expect(lastReport.get(44, "gb", store)).toBe("2");
  });

  it("forgets a dismissed offer for that server only", () => {
    const store = memory();
    lastReport.set(43, "jp", "1", store);
    lastReport.set(43, "na", "2", store);
    lastReport.forget(43, "jp", store);
    expect(lastReport.get(43, "jp", store)).toBeNull();
    expect(lastReport.get(43, "na", store)).toBe("2");
    lastReport.forget(43, "na", store);
    expect(store.length).toBe(0);
  });

  it("tells the form when it changes", () => {
    const heard = vi.fn();
    const stop = lastReport.subscribe(heard);
    lastReport.set(43, "jp", "1", memory());
    lastReport.forget(43, "jp", memory());                      // nothing there: nothing changed
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });

  it("degrades to no offer when storage is blocked or holds something else", () => {
    const store = blocked();
    expect(() => lastReport.set(43, "jp", "1", store)).not.toThrow();
    expect(lastReport.get(43, "jp", store)).toBeNull();
    expect(() => lastReport.forget(43, "jp", store)).not.toThrow();
    expect(lastReport.get(43, "jp", null)).toBeNull();          // no localStorage at all
    const odd = memory();
    odd.setItem("einkk.last-report", "not json");
    expect(lastReport.get(43, "jp", odd)).toBeNull();
  });
});
