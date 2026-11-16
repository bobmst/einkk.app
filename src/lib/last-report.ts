// #98: the last in-raid report this browser sent, per server, for a one-tap re-report of the
// same damage later in the raid. Kept in localStorage only; nothing new is sent anywhere. One
// season at a time: a report for another season replaces it, and reading it for a new season
// clears it. Every access is guarded, so private browsing or blocked storage simply means no
// offer (today's form).
import type { Server } from "./outbox";

const KEY = "einkk.last-report";

interface Saved {
  season: number;
  scores: Partial<Record<Server, string>>;      // the damage as the player typed it
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(store: Storage | null): Saved | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return typeof saved?.season === "number" && saved.scores && typeof saved.scores === "object" ? saved : null;
  } catch {
    return null;
  }
}

function write(store: Storage | null, saved: Saved | null) {
  try {
    if (saved && Object.keys(saved.scores).length) store?.setItem(KEY, JSON.stringify(saved));
    else store?.removeItem(KEY);
  } catch {}
}

const listeners = new Set<() => void>();

export const lastReport = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** The damage last reported for this season and server, or null. Another season's is cleared. */
  get(season: number, server: Server, store: Storage | null = storage()): string | null {
    const saved = read(store);
    if (saved && saved.season !== season) {
      write(store, null);
      return null;
    }
    return saved?.scores[server] ?? null;
  },
  /** After a report was received: the last one per server, replacing another season's. */
  set(season: number, server: Server, score: string, store: Storage | null = storage()) {
    const saved = read(store);
    const scores = saved?.season === season ? saved.scores : {};
    write(store, { season, scores: { ...scores, [server]: score } });
    listeners.forEach((listener) => listener());
  },
  /** The player dismissed the offer. */
  forget(season: number, server: Server, store: Storage | null = storage()) {
    const saved = read(store);
    if (!saved || saved.season !== season) return;
    const scores = { ...saved.scores };
    delete scores[server];
    write(store, { season, scores });
    listeners.forEach((listener) => listener());
  },
};
