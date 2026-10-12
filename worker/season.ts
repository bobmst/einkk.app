// The current season as the engine last published it (outbox season.json), for
// the intake's window checks. The engine is the one clock: the page and the
// intake both read the same document.
export interface SeasonWindow {
  season: number;
  starts_at: string;
  ends_at: string;
  survey_closes_at?: string;
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

/** Ranked play runs from starts_at through the last minute that ends_at names (04:59 JST). */
export function inRankedWindow(season: SeasonWindow, now: Date): boolean {
  const t = now.getTime();
  return t >= Date.parse(season.starts_at) && t < Date.parse(season.ends_at) + 60_000;
}

// The survey's own window when the form exists, else the rule the engine uses
// for it: END 05:00 JST + 20 days, closing 23:59 JST (ends_at is 04:59 JST).
export const FINAL_WINDOW_MS = (20 * 24 + 19) * 3_600_000 + 60_000;

/** Final results run from the close through the end of the survey window. */
export function inFinalWindow(season: SeasonWindow, now: Date): boolean {
  const open = Date.parse(season.ends_at) + 60_000;
  const close = season.survey_closes_at ? Date.parse(season.survey_closes_at) + 60_000
    : Date.parse(season.ends_at) + FINAL_WINDOW_MS;
  const t = now.getTime();
  return t >= open && t < close;
}
