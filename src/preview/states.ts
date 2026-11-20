// The page's states as fixtures, for reviewing the text in the state it appears in (#112).
// docs/text-review/states.md lists the same states and why each one shows what it does.
// Only the preview pages (src/app/states/*.states.tsx, built with STATE_PREVIEW=1) import
// this file, so none of it reaches the production build.
//
// Every document is made up: an example boss, round numbers, no engine output. Times are
// relative to the moment the preview opens, so a countdown reads the same on any day.
// The documents follow contracts/*.schema.json (src/preview/states.test.ts checks them),
// except where a state is about a document the page can't use.
import type { Text } from "@/lib/i18n";
import type {
  Finals, FinalsServer, Health, History, HistoryEntry, Latest, Prediction, Season, Server,
} from "@/lib/outbox";

const HOUR = 3_600_000;
const SEASON = 50;                       // no real season: nobody mistakes these numbers for one
const TIERS = [0.5, 0.7, 1, 2, 3, 5, 10];
const SHAPE = [1.4, 1.32, 1.24, 1.1, 1, 0.87, 0.67];     // each tier's value over the 3% line

/** What the fake API answers (src/preview/fake-api.ts). */
export interface Fixture {
  health: Health;
  /** /api/now.json: the documents, or how the request goes wrong. */
  now: Latest | "missing" | "fail" | "hang";
  history: History | null;
  /** Further outbox documents by key (finals, another season's forecast, a frame's files). */
  outbox?: Record<string, unknown>;
  /** The last visit's data, as the page saved it, and how long ago. */
  snapshot?: { data: unknown; ageMs: number };
  /** A damage this browser reported earlier this season (#98). */
  lastReport?: { season: number; server: Server; score: string };
  /** Added to the page's query, e.g. "frame=preview". */
  search?: string;
}

export type Key = keyof Text | `${keyof Text}.${string}`;

export interface PreviewState {
  id: string;
  group: string;
  title: string;
  /** The server the page follows in this state. */
  server: Server;
  /** The keys this state shows, besides the header and footer (docs/text-review/states.md). */
  keys: Key[];
  build: (now: number) => Fixture;
}

const iso = (ms: number) => new Date(Math.round(ms / 60_000) * 60_000).toISOString().replace(".000Z", "Z");

const HEALTH: Health = { ok: true, intake: true, mode: "production", turnstile_site_key: "1x00000000000000000000AA" };

interface SeasonOpts {
  state: Season["state"];
  /** Hours from now to the start and to the close (the last minute of ranked play). */
  start: number | null;
  end: number | null;
  survey?: boolean;
  previous?: boolean;
}

function season(now: number, o: SeasonOpts): Season & { schema_version: string } {
  const ends = o.end === null ? null : now + o.end * HOUR;
  return {
    schema_version: "0.4.0",
    issued_at: iso(now - HOUR),
    season: SEASON,
    boss: { name: "Example Boss", element: "wind", weakness: "iron" },
    starts_at: o.start === null ? null : iso(now + o.start * HOUR),
    ends_at: ends === null ? null : iso(ends),
    state: o.state,
    survey: o.survey && ends !== null
      ? { url: "https://tally.so/r/example", opens_at: iso(ends + 60_000), closes_at: iso(ends + 20 * 24 * HOUR) }
      : null,
    ...(o.previous ? {
      previous: {
        season: SEASON - 1,
        starts_at: iso(now - 20 * 24 * HOUR),
        ends_at: iso(now - 15 * 24 * HOUR),
        survey: { url: "https://tally.so/r/example", opens_at: iso(now - 15 * 24 * HOUR),
                  closes_at: iso(now + 5 * 24 * HOUR) },
      },
    } : {}),
  };
}

interface PredictionOpts {
  day: number;
  known: number;
  hoursToClose: number;
  line?: number;
  issuedAgoMin?: number;
}

function prediction(now: number, server: Server, o: PredictionOpts, seasonNo = SEASON): Prediction {
  const line = o.line ?? 300;
  const band = (w: number) => ({ lo: Math.round(line * (1 - w) * 100) / 100, hi: Math.round(line * (1 + w) * 100) / 100 });
  const issued = now - (o.issuedAgoMin ?? 12) * 60_000;
  // the whole contract document; the page's type names only the fields it reads
  const doc = {
    schema_version: "0.9.0",
    run_id: `s${seasonNo}-preview-${server}`,
    revision: 1,
    issued_at: iso(issued),
    season: seasonNo,
    server,
    model_version: "preview",
    state: { raid_day: o.day, day_fraction: 0.5, hours_to_close: o.hoursToClose, known_days: o.known, method: "preview" },
    target: { percentile: 3, unit: "0.1B", horizon: "raid_close" },
    prediction: line,
    band: { ...band(0.06), level: 0.9, method: "conformal_walk_forward" },
    bands: [{ level: 0.5, ...band(0.02) }, { level: 0.75, ...band(0.04) }, { level: 0.9, ...band(0.06) }],
    provisional: false,
    inputs: { anchors: [], reports_used_today: 0, nowcast: null },
    dq: { reports_seen_today: 0, reports_rejected_today: 0, blocking: false, notes: [] },
    cells: TIERS.map((percentile, i) => ({
      percentile, value: Math.round(line * SHAPE[i] * 100) / 100, ...(percentile === 0.5 ? { extrapolated: true } : {}),
    })),
  };
  return doc as Prediction;
}

const predictions = (now: number, o: PredictionOpts, missing: Server[] = []) =>
  Object.fromEntries((["jp", "kr", "na", "sea", "tw", "gb"] as Server[]).map((s) => [
    s, missing.includes(s) ? null : prediction(now, s, { ...o, line: LINES[s] }),
  ])) as Latest["predictions"];

const LINES: Record<Server, number> = { jp: 300, kr: 340, na: 250, sea: 220, tw: 230, gb: 260 };
/** The settled lines in the finals document, so the track record agrees with the finals card. */
const FINAL_LINES: Partial<Record<Server, number>> = { jp: 279, gb: 257, kr: 336 };

/** A long track record: inside and outside the range, no range, an old range, an estimate. */
function history(now: number, current: { graded?: boolean; estimate?: boolean } = {}): History & { schema_version: string } {
  const entries: HistoryEntry[] = [];
  const ranged = (lo: number, hi: number) => ({ lo, hi, level: 0.9, method: "conformal_walk_forward" });
  for (const s of ["gb", "jp", "kr", "na", "sea", "tw"] as Server[]) {
    const l = LINES[s];
    entries.push(
      { season: SEASON, server: s, forecast: l, band: ranged(l * 0.94, l * 1.06),
        grading: current.graded ? { error_pct: s === "jp" ? 7.5 : 1.2, hit: s !== "jp" } : null,
        ...(current.graded || current.estimate
          ? { final: { value: FINAL_LINES[s] ?? Math.round(l * 0.99 * 100) / 100, source: "reports" as const, n: 12,
                       ...(current.estimate && s === "kr" ? { estimate: true } : {}) } } : {}) },
      { season: SEASON - 1, server: s, forecast: l * 0.95, band: ranged(l * 0.9, l),
        grading: { error_pct: -2.1, hit: true }, final: { value: l * 0.97, source: "reports", n: 20 } },
      { season: SEASON - 2, server: s, forecast: l * 0.9, band: ranged(l * 0.86, l * 0.94),
        grading: { error_pct: 8.4, hit: false }, final: { value: l * 0.83, source: "survey_and_reports", n: 15 } },
      { season: SEASON - 3, server: s, forecast: l * 0.88, band: ranged(l * 0.83, l * 0.93), grading: null },
      { season: SEASON - 4, server: s, forecast: l * 0.85, grading: { error_pct: -3.0, hit: null },
        final: { value: l * 0.88, source: "manual_collection" } },
      { season: SEASON - 5, server: s, forecast: l * 0.8,
        band: { lo: l * 0.7, hi: l * 0.9, level: null, method: "t_in_sample_legacy" },
        grading: { error_pct: 1.5, hit: true }, final: { value: l * 0.79, source: "survey", n: 6, estimate: true } },
    );
  }
  return { schema_version: "0.3.0", issued_at: iso(now - 2 * HOUR), entries };
}

function finals(now: number, settled: boolean, settlesIn: number, servers: FinalsServer[]): Finals & { schema_version: string } {
  return { schema_version: "0.1.0", issued_at: iso(now - 10 * 60_000), season: SEASON,
           settles_at: iso(now + settlesIn * HOUR), settled, servers };
}

const curve = (line: number) => ({
  points: [0.4, 0.9, 1.6, 2.4, 2.9, 3.05, 3.1, 4.2, 6.5].map((rank_pc) => ({
    rank_pc, damage: Math.round(line * (rank_pc < 3 ? 1 + (3 - rank_pc) * 0.09 : 1 - (rank_pc - 3) * 0.05) * 100) / 100,
  })),
  cells: TIERS.map((percentile, i) => ({
    percentile, value: Math.round(line * SHAPE[i] * 100) / 100, ...(percentile >= 10 ? { extrapolated: true } : {}),
  })),
});

const settledServers = (): FinalsServer[] => [
  { server: "jp", players: 40, near_3: 4, line: { value: FINAL_LINES.jp!, confirmed: true }, ...curve(FINAL_LINES.jp!) },
  { server: "gb", players: 31, near_3: 5, line: { value: FINAL_LINES.gb!, confirmed: true }, ...curve(FINAL_LINES.gb!) },
  { server: "kr", players: 6, near_3: 1, line: { value: FINAL_LINES.kr!, confirmed: false } },
  { server: "na", players: 0, near_3: 0 },
];

const latest = (s: Season, p: Latest["predictions"], f?: Finals | null): Latest =>
  ({ season: s, predictions: p, ...(f !== undefined ? { finals: f } : {}) });

const LIVE_KEYS: Key[] = [
  "season", "states.live", "weakness", "endsIn", "starts", "ends", "timeNote",
  "forecastTitle", "raidDay", "updated", "report", "distTitle", "topPct", "bandsLegend", "calcTitle",
  "calcPlaceholder", "sliceTitle", "damage", "sliceLine", "tier", "range", "reportIntro",
  "reportNearLine", "server", "damageLabel", "damageHelp", "rankDisplay", "rankDisplayHelp", "readAtNow",
  "readAtChange", "next",
];
const TRACK_KEYS: Key[] = [
  "history", "seasonCol", "histForecast", "error", "histFinal", "hit", "miss", "noRange", "pending",
  "noFinal", "histNote", "histEstimate", "legacy",
];
const FINAL_FORM_KEYS: Key[] = ["finalChip", "finalTitle", "finalIntro", "finalOrSurvey", "server", "damageLabel",
  "damageHelp", "rankDisplay", "rankDisplayHelp", "next"];

/** The live mid-raid page, also what a returning visit shows from its snapshot. */
function liveDay3(now: number): Latest {
  return latest(season(now, { state: "live", start: -50, end: 70 }),
    predictions(now, { day: 3, known: 2, hoursToClose: 70 }));
}

export const STATES: PreviewState[] = [
  // ---- loading and errors ----
  {
    id: "first-load", group: "Loading and errors", title: "First visit, still loading", server: "gb", keys: [],
    build: () => ({ health: HEALTH, now: "hang", history: null }),
  },
  {
    id: "load-failed", group: "Loading and errors", title: "First visit, the load failed", server: "gb",
    keys: ["loadFailed"],
    build: () => ({ health: HEALTH, now: "fail", history: null }),
  },
  {
    id: "returning-updating", group: "Loading and errors", title: "Returning visit, updating", server: "gb",
    keys: ["updating", ...LIVE_KEYS],
    build: (now) => ({ health: HEALTH, now: "hang", history: null,
      snapshot: { data: { health: HEALTH, ...liveDay3(now), history: history(now) }, ageMs: 3 * HOUR } }),
  },
  {
    id: "returning-failed", group: "Loading and errors", title: "Returning visit, the load failed", server: "gb",
    keys: ["staleData", ...LIVE_KEYS],
    build: (now) => ({ health: HEALTH, now: "fail", history: null,
      snapshot: { data: { health: HEALTH, ...liveDay3(now), history: history(now) }, ageMs: 26 * HOUR } }),
  },
  {
    id: "nothing-published", group: "Loading and errors", title: "No season published", server: "gb",
    keys: ["nothing", ...TRACK_KEYS],
    build: (now) => ({ health: HEALTH, now: "missing", history: history(now) }),
  },
  {
    id: "page-outdated", group: "Loading and errors", title: "A document too new for this page", server: "gb",
    keys: ["pageOutdated", "reload", "noForecast", "states.live", "endsIn", "report", "reportIntro", "reportNearLine"],
    build: (now) => {
      const doc = liveDay3(now);
      const gb = { ...doc.predictions.gb, schema_version: "1.0.0" } as Prediction;
      return { health: HEALTH, now: { ...doc, predictions: { ...doc.predictions, gb } }, history: null };
    },
  },
  {
    id: "section-failed", group: "Loading and errors", title: "One card fails to draw", server: "gb",
    keys: ["sectionFailed", "reload"],
    build: (now) => {
      const doc = liveDay3(now);
      // not a valid document: without `state` the forecast card throws, and only it fails
      const { state: _drop, ...broken } = doc.predictions.gb as Prediction;
      void _drop;
      return { health: HEALTH, now: { ...doc, predictions: { ...doc.predictions, gb: broken as Prediction } },
               history: null };
    },
  },
  {
    id: "rehearsal-frame", group: "Loading and errors", title: "Rehearsal site, a frame (frozen clock)", server: "gb",
    keys: ["rehearsal", "frozen", "reportFrozen", ...LIVE_KEYS.filter((k) => !k.startsWith("report") && k !== "server")],
    build: (now) => {
      const at = now - 2 * HOUR;
      const doc = liveDay3(at);
      return {
        health: { ...HEALTH, mode: "rehearsal" }, now: doc, history: history(at), search: "frame=preview",
        outbox: {
          "frames/preview/frame.json": { schema_version: "0.1.0", id: "preview", at: iso(at) },
          "frames/preview/season.json": doc.season,
          "frames/preview/history.json": history(at),
          ...Object.fromEntries(Object.entries(doc.predictions).map(([s, p]) =>
            [`frames/preview/predictions/s${SEASON}/${s}.json`, p])),
        },
      };
    },
  },

  // ---- before the raid ----
  {
    id: "upcoming-undated", group: "Before the raid", title: "Announced, no dates yet", server: "gb",
    keys: ["season", "states.upcoming", "weakness", "datesTba", "report", "reportClosed"],
    build: (now) => ({ health: HEALTH, now: latest(season(now, { state: "upcoming", start: null, end: null }), {
      jp: null, kr: null, na: null, sea: null, tw: null, gb: null }), history: null }),
  },
  {
    id: "upcoming-dated", group: "Before the raid", title: "Dated, before the start; last season's final results still open",
    server: "gb",
    keys: ["states.upcoming", "startsIn", "starts", "ends", "timeNote", "forecastTitle", "beforeRaid", "updated",
      "distTitle", "earlyNote", "report", "reportClosed", ...FINAL_FORM_KEYS, ...TRACK_KEYS],
    build: (now) => ({
      health: HEALTH, history: history(now),
      now: latest(season(now, { state: "upcoming", start: 30, end: 150, previous: true }),
        predictions(now, { day: 1, known: 0, hoursToClose: 120, issuedAgoMin: 300 })),
      outbox: { [`predictions/s${SEASON - 1}/gb.json`]: prediction(now, "gb", { day: 5, known: 4, hoursToClose: 1 }, SEASON - 1) },
    }),
  },

  // ---- during the raid ----
  {
    id: "live-day1", group: "During the raid", title: "Live, day 1 (no daily line yet)", server: "gb",
    keys: [...LIVE_KEYS, "earlyNote", "rankAsk", "rankAskButton"],
    build: (now) => ({
      health: HEALTH, history: history(now),
      now: latest(season(now, { state: "live", start: -10, end: 110 }), predictions(now, { day: 1, known: 0, hoursToClose: 110 })),
    }),
  },
  {
    id: "live-day3", group: "During the raid", title: "Live, day 3, a damage reported earlier", server: "gb",
    keys: [...LIVE_KEYS, "earlyNote", "rereport", "rereportUse", "rereportDismiss", ...TRACK_KEYS],
    build: (now) => ({ health: HEALTH, now: liveDay3(now), history: history(now),
      lastReport: { season: SEASON, server: "gb", score: "25,431,226,107" } }),
  },
  {
    id: "live-no-forecast", group: "During the raid", title: "Live, no forecast for this server, reporting off", server: "sea",
    keys: ["states.live", "endsIn", "noForecast", "report", "reportUnavailable"],
    build: (now) => ({
      health: { ...HEALTH, intake: false }, history: null,
      now: latest(season(now, { state: "live", start: -50, end: 70 }), predictions(now, { day: 3, known: 2, hoursToClose: 70 }, ["sea"])),
    }),
  },

  // ---- after the close ----
  {
    id: "closed-no-finals", group: "After the close", title: "Just closed, no final results document yet", server: "gb",
    keys: ["reportFinal", "states.measuring", "survey", "distAfterClose", ...FINAL_FORM_KEYS, ...TRACK_KEYS],
    build: (now) => ({
      health: HEALTH, history: history(now),
      now: latest(season(now, { state: "measuring", start: -121, end: -1, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 90 }), null),
    }),
  },
  {
    id: "closed-no-forecast", group: "After the close", title: "Closed, no forecast was published for this server", server: "sea",
    keys: ["reportFinal", "states.measuring", "noForecastEnded", ...FINAL_FORM_KEYS],
    build: (now) => ({
      health: HEALTH, history: null,
      now: latest(season(now, { state: "measuring", start: -121, end: -1, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 90 }, ["sea"]), null),
    }),
  },
  {
    id: "closed-collecting", group: "After the close", title: "Final results coming in (counts only)", server: "kr",
    keys: ["reportFinal", "finalsTitle", "finalsCollecting", "finalsNear3", "finalsReveal", ...FINAL_FORM_KEYS],
    build: (now) => ({
      health: HEALTH, history: history(now),
      now: latest(season(now, { state: "measuring", start: -125, end: -5, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 400 }),
        finals(now, false, 7, [{ server: "kr", players: 14, near_3: 2 }, { server: "jp", players: 30, near_3: 3 }])),
    }),
  },
  {
    id: "closed-reveal-soon", group: "After the close", title: "Settle time passed, document not settled yet; no results here", server: "na",
    keys: ["reportFinal", "finalsTitle", "finalsNone", "finalsRevealSoon", ...FINAL_FORM_KEYS],
    build: (now) => ({
      health: HEALTH, history: history(now),
      now: latest(season(now, { state: "measuring", start: -133, end: -13, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 900 }),
        finals(now, false, -0.5, [{ server: "kr", players: 14, near_3: 2 }])),
    }),
  },
  {
    id: "settled-confirmed", group: "After the close", title: "Settled, line confirmed, with the curve", server: "gb",
    keys: ["reportFinal", "finalsTitle", "finalsFrom", "finalsForecast", "finalsError", "finalsCurveTitle", "topPct", "finalsPoints",
      "tier", "damage", "estimated", ...TRACK_KEYS],
    build: (now) => ({
      health: HEALTH, history: history(now, { graded: true }),
      now: latest(season(now, { state: "measuring", start: -168, end: -48, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 3000 }),
        finals(now, true, -36, settledServers())),
    }),
  },
  {
    id: "settled-estimate", group: "After the close", title: "Settled, the line is only an estimate", server: "kr",
    keys: ["reportFinal", "finalsTitle", "finalsFrom", "finalsUnconfirmed", "histEstimate"],
    build: (now) => ({
      health: HEALTH, history: history(now, { estimate: true }),
      now: latest(season(now, { state: "measuring", start: -168, end: -48, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 3000 }),
        finals(now, true, -36, settledServers())),
    }),
  },
  {
    id: "settled-jp", group: "After the close", title: "Settled, JP (forecast outside its range)", server: "jp",
    keys: ["reportFinal", "finalsTitle", "finalsJp", "finalsForecast", "finalsError", "finalsCurveTitle", "finalsPoints"],
    build: (now) => ({
      health: HEALTH, history: history(now, { graded: true }),
      now: latest(season(now, { state: "measuring", start: -168, end: -48, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 3000 }),
        finals(now, true, -36, settledServers())),
    }),
  },
  {
    id: "settled-no-results", group: "After the close", title: "Settled, no results from this server", server: "na",
    keys: ["reportFinal", "finalsTitle", "finalsNone"],
    build: (now) => ({
      health: HEALTH, history: history(now, { graded: true }),
      now: latest(season(now, { state: "measuring", start: -168, end: -48, survey: true }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 3000 }),
        finals(now, true, -36, settledServers())),
    }),
  },
  {
    id: "ended", group: "After the close", title: "Final results window over", server: "gb",
    keys: ["states.closed", "finalsTitle", "finalsFrom", "finalsForecast", "finalsError", "finalsCurveTitle"],
    build: (now) => ({
      health: HEALTH, history: history(now, { graded: true }),
      now: latest(season(now, { state: "closed", start: -24 * 26, end: -24 * 21 }),
        predictions(now, { day: 5, known: 4, hoursToClose: 1, issuedAgoMin: 21 * 24 * 60 }),
        finals(now, true, -24 * 20, settledServers())),
    }),
  },
];

export const stateById = (id: string) => STATES.find((s) => s.id === id) ?? null;
