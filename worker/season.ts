// The current season as the engine last published it (outbox season.json), for
// the intake's window checks. The engine is the one clock: the page and the
// intake both read the same document. The windows themselves are shared with the
// page: src/lib/windows.ts.
import type { SeasonTimes } from "../src/lib/windows";

export { inFinalWindow, inRankedWindow } from "../src/lib/windows";

export interface SeasonWindow extends SeasonTimes {
  season: number;
}

export async function currentSeason(outbox: R2Bucket | undefined): Promise<SeasonWindow | null> {
  const object = await outbox?.get("season.json");
  if (!object) return null;
  try {
    const doc = (await object.json()) as Partial<SeasonWindow> & { survey?: { closes_at?: string } | null };
    if (typeof doc.season !== "number" || !doc.starts_at || !doc.ends_at) return null;
    return { season: doc.season, starts_at: doc.starts_at, ends_at: doc.ends_at,
      survey_closes_at: doc.survey?.closes_at };
  } catch {
    return null;
  }
}
