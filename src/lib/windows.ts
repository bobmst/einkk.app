// The season's windows, one copy for the page and the Worker (worker/season.ts)
// so the two never disagree on when reports are taken. Plain code, no DOM and no
// Workers types: both builds import it.
//
// Every time the engine publishes names the last minute of its window (ends_at is
// 04:59 JST, the survey's closes_at 23:59 JST), so a window runs through the end
// of that minute.

export interface SeasonTimes {
  starts_at: string;
  ends_at: string;
  survey_closes_at?: string | null;
}

/** The first instant after the minute `iso` names. */
export const throughMinute = (iso: string): number => Date.parse(iso) + 60_000;

// Before the survey form exists, the rule the engine uses for it: END 05:00 JST
// + 20 days, closing 23:59 JST (ends_at is 04:59 JST, END day).
export const FINAL_WINDOW_MS = (20 * 24 + 19) * 3_600_000 + 60_000;

/** Ranked play: from starts_at through the last minute ends_at names. */
export function inRankedWindow(season: SeasonTimes, now: number): boolean {
  return now >= Date.parse(season.starts_at) && now < throughMinute(season.ends_at);
}

/** Final results: from the close through the end of the survey window. */
export function inFinalWindow(season: SeasonTimes, now: number): boolean {
  const close = season.survey_closes_at ? throughMinute(season.survey_closes_at)
    : Date.parse(season.ends_at) + FINAL_WINDOW_MS;
  return now >= throughMinute(season.ends_at) && now < close;
}
