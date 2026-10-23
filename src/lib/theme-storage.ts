// Where MUI keeps the light/dark choice (#62). MUI's own localStorage manager writes
// back every mode another tab sends it: its storage listener calls setMode, and
// setMode stores the value. A tab that applies an old value late (a background tab
// the browser froze or throttled) stores that stale value again, every other tab
// switches to it, and the stale tabs go on echoing: a new tab flickers between
// light and dark. Here only the viewer's own toggle writes; a value that arrives
// from another tab is applied and never stored again.
import type { StorageManager } from "@mui/material/styles";

let chosen: string | null = null;            // the value the toggle in this tab is about to store

/** Call right before setMode from the toggle: the one write this tab makes. */
export function chooseMode(mode: string) {
  chosen = mode;
}

export const themeStorage: StorageManager = ({ key, storageWindow }) => {
  const win = storageWindow ?? (typeof window === "undefined" ? null : window);
  return {
    get(defaultValue) {
      try {
        return win?.localStorage.getItem(key) || defaultValue;
      } catch {
        return defaultValue;
      }
    },
    set(value) {
      if (!win || value !== chosen) return;   // another tab's choice, or MUI's own bookkeeping
      chosen = null;
      try {
        win.localStorage.setItem(key, value);
      } catch {}
    },
    subscribe(handler) {
      if (!win) return () => {};
      const listener = (e: StorageEvent) => {
        if (e.key === key) handler(e.newValue);
      };
      win.addEventListener("storage", listener);
      return () => win.removeEventListener("storage", listener);
    },
  };
};
