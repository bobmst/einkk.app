// The view page's own browser storage. On uat the preview shares its origin with the rehearsal
// page, and a fixture writes what the page remembers (the saved snapshot, the last report, the
// language and the followed server). Kept in the real localStorage, a fixture would show up on
// uat's own page afterwards, and in its other open tabs at once through storage events. So the
// view page swaps localStorage for an in-memory one before anything reads it: the fixture lives
// and dies with the tab. Only the review marks (review.ts) stay in the real storage.

let real: Storage | null = null;

/** The browser's own localStorage, for the review marks; null where there is none. */
export function realStorage(): Storage | null {
  if (real) return real;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Replace window.localStorage with an in-memory store for this tab. Called once, at load. */
export function isolateStorage() {
  if (typeof window === "undefined" || real) return;
  real = realStorage();
  const data = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => memory });
}
