// The current season as the engine last published it (outbox season.json), for
// the intake's window checks. The engine is the one clock: the page and the
// intake both read the same document.
export interface SeasonWindow {
  season: number;
  starts_at: string;
  ends_at: string;
}

export async function currentSeason(outbox: R2Bucket | undefined): Promise<SeasonWindow | null> {
  const object = await outbox?.get("season.json");
  if (!object) return null;
  try {
    const doc = (await object.json()) as Partial<SeasonWindow>;
    if (typeof doc.season !== "number" || !doc.starts_at || !doc.ends_at) return null;
    return { season: doc.season, starts_at: doc.starts_at, ends_at: doc.ends_at };
  } catch {
    return null;
  }
}

/** Ranked play runs from starts_at through the last minute that ends_at names (04:59 JST). */
export function inRankedWindow(season: SeasonWindow, now: Date): boolean {
  const t = now.getTime();
  return t >= Date.parse(season.starts_at) && t < Date.parse(season.ends_at) + 60_000;
}
