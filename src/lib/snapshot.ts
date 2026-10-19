// The data the page last loaded, kept in localStorage so a returning player sees it
// at once, marked as updating, instead of a skeleton while the requests run (or
// hang, from where Cloudflare's nearest colo is far away). Only the outbox
// documents and the public health answer go in, all of it public data.
const KEY = "snapshot.v1";

export interface Snapshot<T> {
  saved_at: number;                 // ms
  data: T;
}

export function loadSnapshot<T>(): Snapshot<T> | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Snapshot<T> | null;
    if (saved && typeof saved.saved_at === "number" && saved.data && typeof saved.data === "object") return saved;
  } catch {}
  return null;
}

export function saveSnapshot<T>(data: T, at = Date.now()) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ saved_at: at, data } satisfies Snapshot<T>));
  } catch {}
}

// As an external store (React's useSyncExternalStore), like the language and the
// followed server: the static export renders without it and the browser shows it
// right after hydration. Read once per page load; later saves are for the next visit.
let read: Snapshot<unknown> | null | undefined;
export const snapshotStore = {
  subscribe: () => () => {},
  get: (): Snapshot<unknown> | null => (read === undefined ? (read = loadSnapshot()) : read),
  server: (): Snapshot<unknown> | null => null,
};
