// The current season as the engine last published it (outbox season.json), for
// the intake's window checks. The engine is the one clock: the page and the
// intake both read the same document. The windows themselves are shared with the
// page: src/lib/windows.ts.
//
// The document also carries the season before it (`previous`, contract 0.2.0)
// while that season may still take final results, so publishing the next season
// doesn't close the last one's final window early.
import type { SeasonTimes } from "../src/lib/windows";

export { inFinalWindow, inRankedWindow } from "../src/lib/windows";

export interface SeasonWindow extends SeasonTimes {
  season: number;
}

export interface PublishedSeason extends SeasonWindow {
  previous?: SeasonWindow;
}

type SeasonFields = Partial<SeasonWindow> & { survey?: { closes_at?: string } | null };

function seasonWindow(doc: SeasonFields | null | undefined): SeasonWindow | null {
  if (!doc || typeof doc.season !== "number" || !doc.starts_at || !doc.ends_at) return null;
  return { season: doc.season, starts_at: doc.starts_at, ends_at: doc.ends_at,
    survey_closes_at: doc.survey?.closes_at };
}

export async function currentSeason(outbox: R2Bucket | undefined): Promise<PublishedSeason | null> {
  const object = await outbox?.get("season.json");
  if (!object) return null;
  try {
    const doc = (await object.json()) as SeasonFields & { previous?: SeasonFields | null };
    const current = seasonWindow(doc);
    if (!current) return null;
    const previous = seasonWindow(doc.previous);
    return previous && previous.season < current.season ? { ...current, previous } : current;
  } catch {
    return null;
  }
}

/** The published season (or the one before it) a final result for `season` belongs to. */
export function finalSeason(published: PublishedSeason | null, season: unknown): SeasonWindow | null {
  if (!published) return null;
  if (season === published.season) return published;
  return published.previous && season === published.previous.season ? published.previous : null;
}
