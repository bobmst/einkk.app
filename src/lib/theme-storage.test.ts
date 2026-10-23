import { describe, expect, it } from "vitest";
import { chooseMode, themeStorage } from "./theme-storage";

function fakeWindow() {
  const items = new Map<string, string>();
  const listeners = new Set<(e: StorageEvent) => void>();
  const win = {
    localStorage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    },
    addEventListener: (_: string, l: (e: StorageEvent) => void) => void listeners.add(l),
    removeEventListener: (_: string, l: (e: StorageEvent) => void) => void listeners.delete(l),
  };
  const send = (key: string, newValue: string) => listeners.forEach((l) => l({ key, newValue } as StorageEvent));
  return { win: win as unknown as Window, items, send };
}

describe("themeStorage", () => {
  it("stores the toggle's choice", () => {
    const { win, items } = fakeWindow();
    const mode = themeStorage({ key: "mui-mode", storageWindow: win });
    chooseMode("dark");
    mode.set("dark");
    expect(items.get("mui-mode")).toBe("dark");
    expect(mode.get("system")).toBe("dark");
  });

  it("never writes back what another tab sent, however late it is applied", () => {
    const { win, items, send } = fakeWindow();
    const mode = themeStorage({ key: "mui-mode", storageWindow: win });
    items.set("mui-mode", "dark");
    const seen: (string | null)[] = [];
    mode.subscribe((v) => {
      seen.push(v);
      mode.set(v ?? "system");             // what MUI's listener does through setMode
    });
    send("mui-mode", "light");
    send("mui-mode", "dark");
    send("mui-mode", "light");              // a stale value replayed by a frozen tab
    expect(seen).toEqual(["light", "dark", "light"]);
    expect(items.get("mui-mode")).toBe("dark");
  });

  it("writes only once per choice", () => {
    const { win, items } = fakeWindow();
    const mode = themeStorage({ key: "mui-mode", storageWindow: win });
    chooseMode("light");
    mode.set("light");
    items.set("mui-mode", "dark");           // another tab chose dark since
    mode.set("light");                       // a late echo of this tab's old choice
    expect(items.get("mui-mode")).toBe("dark");
  });
});
