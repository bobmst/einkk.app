"use client";
// The live page. Everything is read in the browser from the outbox through
// /api/outbox (docs/ARCHITECTURE.md), so a new forecast needs no rebuild; it
// checks again when the engine can have published (src/lib/refresh.ts). Each
// player follows one server: its 3% line, its damage-by-rank curve and its track
// record.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import TranslateOutlined from "@mui/icons-material/TranslateOutlined";
import {
  LANG_NAMES, LANGS, SERVER_ORDER, duration, langStore, serverName, serverStore, text, type Lang,
} from "@/lib/i18n";
import {
  finalWindowOpen, finalsKey, health, latestPrediction, outbox, predictionKey, previousFinalOpen, stateAt,
  surveyLink, type Finals, type Health, type History, type Prediction, type Predictions, type Season,
  type Server,
} from "@/lib/outbox";
import { freeze, frozenAt, now as clockNow, viewFrom, viewKey, type View } from "@/lib/clock";
import { saveSnapshot, snapshotStore, type Snapshot } from "@/lib/snapshot";
import { chooseMode } from "@/lib/theme-storage";
import { RETRY_MS, nextDue, plan, type Kind, type Known } from "@/lib/refresh";
import FinalsView from "./finals-view";
import ReportForm from "./report-form";
import SeasonCard from "./season-card";
import { Distribution, Forecast } from "./server-view";
import TrackRecord from "./track-record";

// Every /api request runs the Worker, and the free plan allows 100k a day: when
// each document is checked again is src/lib/refresh.ts's (#86).
const ISSUES = "https://github.com/bobmst/einkk.app/issues/new/choose";
const HTML_LANG: Record<Lang, string> = { en: "en", ja: "ja", ko: "ko", zhs: "zh-Hans", zht: "zh-Hant", es: "es" };

interface Data {
  health: Health | null;
  season: Season | null;
  predictions: Predictions;
  history: History | null;
  finals?: Finals | null;               // once the raid has closed (solo_raid_predict #63)
}

// health (site mode, Turnstile key) doesn't change while the page is open: fetched once.
// Of the forecasts only the followed server's: the page shows one server, and each
// document is a Worker request. Another server's is fetched when the player follows it.
// All in one round: /api/latest finds the season on the Worker's side, so the page
// doesn't wait for season.json before it can ask for the forecast.
// A frame (src/lib/clock.ts) has no /api/latest: its documents are read by key, season.json first.
async function load(server: Server, known: Health | null, view: View): Promise<Data> {
  const key = (k: string) => viewKey(view, k);
  const [h, season, history, current] = await Promise.all([
    known ?? health(), outbox<Season>(key("season.json")), outbox<History>(key("history.json")),
    view.frame ? null : latestPrediction(server),
  ]);
  if (!season) return { health: h, season, predictions: {}, history };
  // The Worker's read of season.json and the page's are cached separately (30 s each),
  // so right at a new season they can name different seasons: the page's decides.
  const ended = ["measuring", "closed"].includes(stateAt(season, clockNow()));
  const [prediction, finals] = await Promise.all([
    // a frame by key; otherwise only when /api/latest answered for another season
    view.frame || (current && current.season !== season.season)
      ? outbox<Prediction>(key(predictionKey(season.season, server))) : current,
    ended ? outbox<Finals>(key(finalsKey(season.season))) : undefined,   // undefined: not read (src/lib/refresh.ts)
  ]);
  return { health: h, season, predictions: { [server]: prediction }, history, finals };
}

const REAL_VIEW: View = { frame: null, at: null };

/**
 * The view the link asks for, once the site's mode is known; a frame also freezes the clock.
 * Throws (the refresh then retries) without a mode, or when a frame's frame.json can't be
 * read: never a frame's documents on a running clock, nor a frame link silently live.
 */
async function openView(h: Health | null): Promise<View> {
  if (!h) throw new Error("the site's mode is unknown");
  const view = viewFrom(h.mode, window.location.search);
  if (view.frame) {
    const frame = await outbox<{ at: string }>(`frames/${view.frame}/frame.json`);
    if (!frame || !Number.isFinite(Date.parse(frame.at))) throw new Error(`frame ${view.frame} has no frame.json`);
    freeze(Date.parse(frame.at));
  } else {
    freeze(view.at);
  }
  return view;
}

const ASKS = /[?&](frame|at)=/;
const linkAsks = () => ASKS.test(window.location.search);
const noSubscription = () => () => {};

function ThemeToggle({ label }: { label: string }) {
  const { mode, systemMode, setMode } = useColorScheme();
  if (!mode) return <Box sx={{ width: 40 }} />;           // not resolved before hydration
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  return (
    <Tooltip title={label}>
      <IconButton onClick={() => {
        const next = dark ? "light" : "dark";
        chooseMode(next);                                 // the one write this tab makes (#62)
        setMode(next);
      }} aria-label={label}>
        {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
      </IconButton>
    </Tooltip>
  );
}

export default function Dashboard() {
  const lang = useSyncExternalStore(langStore.subscribe, langStore.get, langStore.server);
  const picked = useSyncExternalStore(serverStore.subscribe, serverStore.get, serverStore.server);
  const server = picked ?? serverStore.fallback(lang);
  const [loaded, setLoaded] = useState<Data | null>(null);       // this visit's
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // until this visit's first load succeeds, the last visit's data, marked as updating
  const saved = useSyncExternalStore(snapshotStore.subscribe, snapshotStore.get, snapshotStore.server) as
    Snapshot<Data> | null;
  // a link asking for a frame or a time never shows the last visit's data: it may be live
  // data, or another frame's
  const asked = useSyncExternalStore(noSubscription, linkAsks, () => false);
  const usable = asked ? null : saved;
  const stale = !loaded && usable !== null;
  const data = loaded ?? usable?.data ?? null;
  const shownAt = loaded ? loadedAt : usable?.saved_at ?? null;
  const [now, setNow] = useState(() => clockNow());
  const [view, setView] = useState<View>({ frame: null, at: null });
  const followed = useRef(server);                    // the refresh reads it, without restarting
  const fetching = useRef(new Set<string>());
  const unsaved = useRef<{ data: Data; at: number } | null>(null);
  // what the page shows, as the refresh and the server switch both see it: each updates it
  // before it renders, so neither builds on a copy the other has moved past
  const held = useRef<Data | null>(null);
  const [switchFailed, setSwitchFailed] = useState<string | null>(null);   // that forecast's key
  useEffect(() => {
    followed.current = server;
  }, [server]);

  useEffect(() => {
    let alive = true;
    let known: Health | null = null;
    let shown: View | null = null;                 // what the link asks for, once health is known
    const asks = linkAsks();
    const jitter = Math.random();                  // this tab's share of the checks' spread
    const fetched: Known["fetched"] = { season: 0, prediction: 0, finals: null };
    const retry: Partial<Record<Kind | "all", number>> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;

    const show = (fresh: Data) => {
      held.current = fresh;
      const at = Date.now();
      setLoaded(fresh);
      setLoadedAt(at);
      setFailed(false);
      unsaved.current = asks ? null : { data: fresh, at };   // a frame or a frozen time is no visit to resume
    };
    const knownNow = (): Known => ({
      season: held.current?.season ?? null,
      issuedAt: held.current?.predictions[followed.current]?.issued_at ?? null,
      finals: held.current?.finals && held.current.finals.season === held.current.season?.season
        ? { settles_at: held.current.finals.settles_at, settled: held.current.finals.settled } : null,
      fetched,
    });
    // the earliest check due, retries included; null: nothing is due by time
    const nextCheck = (): number | null => {
      // before the first load works, only its retry: never a zero that would spin
      const times = [held.current ? nextDue(plan(knownNow(), Date.now(), jitter)) : null, ...Object.values(retry)]
        .filter((t): t is number => t !== undefined && t !== null);
      return times.length ? Math.min(...times) : null;
    };
    const schedule = () => {
      clearTimeout(timer);
      // a frozen clock shows one moment: nothing to check for
      if (!alive || busy || (held.current && frozenAt() !== null)) return;
      const at = nextCheck();
      if (at !== null) timer = setTimeout(() => !document.hidden && check(), Math.max(0, at - Date.now()));
    };

    // everything, in one round: on open, and when the season changes under the page
    const reload = async () => {
      // Only a link that asks for a frame or a time waits for the site's mode first; every
      // other open (production's always) loads in one round as before, health included.
      const v = shown || !asks ? shown ?? REAL_VIEW
        : await health().then(async (h) => {
          known = h;
          shown = await openView(h);
          if (alive) {
            setView(shown);
            setNow(clockNow());
          }
          return shown;
        });
      const fresh = await load(followed.current, known, v);
      if (!alive) return;
      known = fresh.health;
      fetched.season = fetched.prediction = Date.now();
      fetched.finals = fresh.finals === undefined ? null : Date.now();
      show(fresh);
    };

    // what is due: everything until the first load works, then the followed forecast,
    // season.json and the finals, each on its own time (src/lib/refresh.ts)
    const check = async () => {
      if (!alive || busy) return;
      busy = true;
      clearTimeout(timer);
      const now = Date.now();
      try {
        if (!held.current) {
          try {
            await reload();
            delete retry.all;
          } catch {
            retry.all = Date.now() + RETRY_MS;
            if (alive) setFailed(true);
          }
          return;
        }
        const due = plan(knownNow(), now, jitter);
        const isDue = (k: Kind) => (due[k] !== null && (due[k] as number) <= now) || (retry[k] ?? Infinity) <= now;
        if (isDue("season")) {
          delete retry.season;
          try {
            const s = await outbox<Season>(viewKey(shown ?? REAL_VIEW, "season.json"));
            fetched.season = Date.now();
            if (!alive) return;
            if (s?.season !== held.current.season?.season) return void (await reload());
            show({ ...held.current, season: s });
          } catch {
            retry.season = Date.now() + RETRY_MS;
          }
        }
        const season = held.current.season;
        if (isDue("prediction") && season) {
          delete retry.prediction;
          const server = followed.current;
          try {
            const p = await latestPrediction(server);
            fetched.prediction = Date.now();
            if (!alive) return;
            // a forecast for another season, or the first of an undated one: the season moved
            if (p && (p.season !== season.season || !season.starts_at)) return void (await reload());
            const before = held.current.predictions[server];
            // a new run republished every server: the others held.current are out of date now
            const others = p && before && p.issued_at !== before.issued_at ? {} : held.current.predictions;
            show({ ...held.current, predictions: { ...others, [server]: p } });
          } catch {
            retry.prediction = Date.now() + RETRY_MS;
          }
        }
        if (isDue("finals") && season) {
          delete retry.finals;
          try {
            const f = await outbox<Finals>(viewKey(shown ?? REAL_VIEW, finalsKey(season.season)));
            fetched.finals = Date.now();
            if (alive) show({ ...held.current, finals: f });
          } catch {
            retry.finals = Date.now() + RETRY_MS;
          }
        }
      } finally {
        busy = false;
        schedule();
      }
    };

    // a hidden tab checks nothing; shown again, it catches up on whatever came due
    const onShow = () => {
      if (document.hidden || (held.current && frozenAt() !== null)) return;
      const at = nextCheck();
      if (at !== null && at <= Date.now()) void check();
    };
    void check();
    document.addEventListener("visibilitychange", onShow);
    const tick = setInterval(() => setNow(clockNow()), 30_000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  // Kept for the next visit only once the page has rendered it: an effect runs after the
  // commit, so documents the page can't draw never become the snapshot the next visit opens with.
  useEffect(() => {
    if (!unsaved.current) return;
    saveSnapshot(unsaved.current.data, unsaved.current.at);
    unsaved.current = null;
  }, [loaded]);

  // a newly followed server's forecast; a refresh keeps the others until a new run replaces them
  const seasonNumber = data?.season?.season;
  const missing = seasonNumber !== undefined && !(server in (data?.predictions ?? {}));
  useEffect(() => {
    if (!missing || seasonNumber === undefined || stale) return;   // a first load in flight brings it
    const key = predictionKey(seasonNumber, server);
    if (fetching.current.has(key)) return;
    fetching.current.add(key);
    outbox<Prediction>(viewKey(view, key)).then(
      (p) => {
        const prev = held.current;
        if (!prev || prev.season?.season !== seasonNumber) return;
        held.current = { ...prev, predictions: { ...prev.predictions, [server]: p } };
        setLoaded(held.current);
      },
      () => setSwitchFailed(key),                 // shown in the forecast slot; the next refresh retries
    ).finally(() => fetching.current.delete(key));
  }, [missing, seasonNumber, server, stale, view]);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const t = text(lang);
  // the document's state lags the open and close by up to a run: the clock decides it
  const published = data?.season;
  const stateNow = published ? stateAt(published, now) : null;
  const season = useMemo(() => (published && stateNow ? { ...published, state: stateNow } : null),
    [published, stateNow]);
  const prediction = data?.predictions[server];
  const ended = season?.state === "measuring" || season?.state === "closed";
  // From lg (1200px) the page splits in two: the season, the forecast and the report
  // card on the left, the distribution beside them. Without a forecast, or once the raid
  // has closed (no distribution then), there is no second column.
  const wide = Boolean(season && prediction && !ended);
  const pageWidth = { md: 900, lg: wide ? 1240 : 900 };
  const one = `"season" "forecast" "dist" "report" "hist"`;
  const reportOpen = season?.state === "live" && !finalWindowOpen(season, now);
  // the closing season's final results, still taken after the next season is published
  const previous = season ? previousFinalOpen(season, now) : null;

  const ownCard = !season ? null : finalWindowOpen(season, now) ? (
    <ReportForm key={`final-${season.season}-${server}`} final season={season}
                health={data?.health ?? null} server={server} predictions={data?.predictions ?? {}}
                lang={lang} t={t} surveyUrl={surveyLink(season.survey, now)} />
  ) : (season.state === "live" || season.state === "upcoming") ? (
    <ReportForm key={server} season={season} health={data?.health ?? null} server={server}
                lang={lang} t={t} predictions={data?.predictions ?? {}} />
  ) : null;
  const previousCard = previous && (
    <ReportForm key={`final-${previous.season}-${server}`} final
                season={{ season: previous.season, state: "measuring" }}
                health={data?.health ?? null} server={server}
                lang={lang} t={t} surveyUrl={surveyLink(previous.survey, now)} />
  );

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={0}
              sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Toolbar sx={{ gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" component="h1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              einkk.app
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p" noWrap>{t.tagline}</Typography>
          </Box>
          <TranslateOutlined fontSize="small" sx={{ color: "text.secondary" }} />
          <Select variant="standard" disableUnderline size="small" value={lang}
                  onChange={(e) => langStore.set(e.target.value as Lang)}
                  inputProps={{ "aria-label": t.language }}>
            {LANGS.map((l) => <MenuItem key={l} value={l}>{LANG_NAMES[l]}</MenuItem>)}
          </Select>
          <ThemeToggle label={t.theme} />
        </Toolbar>
        {season && (
          <Container maxWidth={false} disableGutters sx={{ maxWidth: pageWidth }}>
            <Tabs value={server} onChange={(_, s) => serverStore.set(s)} aria-label={t.yourServer}
                  variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
              {SERVER_ORDER.map((s) => <Tab key={s} value={s} label={serverName(lang, s)} />)}
            </Tabs>
          </Container>
        )}
      </AppBar>

      <Container maxWidth={false} sx={{ py: 3, maxWidth: pageWidth }}>
        <Stack spacing={2.5}>
          {data?.health?.mode === "rehearsal" && <Alert severity="warning">{t.rehearsal}</Alert>}
          {frozenAt() !== null && (
            <Alert severity="info">{t.frozen(new Date(frozenAt() as number).toLocaleString(HTML_LANG[lang]),
              view.frame)}</Alert>
          )}
          {failed && !data && <Alert severity="error">{t.loadFailed}</Alert>}
          {failed && data && shownAt !== null && frozenAt() === null && (
            <Alert severity="warning">{t.staleData(duration(lang, now - shownAt))}</Alert>
          )}
          {stale && !failed && shownAt !== null && frozenAt() === null && (
            <Stack direction="row" spacing={1} role="status" sx={{ alignItems: "center", color: "text.secondary" }}>
              <CircularProgress size={14} color="inherit" />
              <Typography variant="body2">{t.updating(duration(lang, now - shownAt))}</Typography>
            </Stack>
          )}
          {!data && !failed && (
            <Stack spacing={2}>
              <Skeleton variant="rounded" height={240} />
              <Skeleton variant="rounded" height={160} />
            </Stack>
          )}
          {data && !season && <Typography color="text.secondary">{t.nothing}</Typography>}

          {season && (
            <Box sx={{
              display: "grid", gap: 2.5, alignItems: "start",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: wide ? "minmax(0, 5fr) minmax(0, 7fr)" : "minmax(0, 1fr)" },
              gridTemplateAreas: { xs: one, lg: wide ? `"season dist" "forecast dist" "report dist" "hist hist"` : one },
              gridTemplateRows: { lg: wide ? "auto auto 1fr auto" : "none" },
            }}>
              <Box sx={{ gridArea: "season" }}>
                <SeasonCard key={season.season} season={season} lang={lang} t={t} now={now} />
              </Box>

              {/* after the close the forecast and its table would only invite players to report
                  their numbers back as final results: hidden until this season's own lines exist */}
              {ended && data?.finals?.season === season.season ? (
                <Box sx={{ gridArea: "forecast" }}>
                  <FinalsView finals={data.finals} server={server} lang={lang} t={t} now={now}
                    entry={data.history?.entries.find((e) => e.season === season.season && e.server === server)} />
                </Box>
              ) : prediction && ended ? (
                <Typography variant="body2" color="text.secondary" sx={{ gridArea: "forecast" }}>
                  {t.distAfterClose}
                </Typography>
              ) : prediction ? (
                <>
                  <Box sx={{ gridArea: "forecast" }}>
                    <Forecast p={prediction} lang={lang} t={t} now={now} report={reportOpen} ended={ended} />
                  </Box>
                  <Box sx={{ gridArea: "dist" }}>
                    <Distribution p={prediction} lang={lang} t={t} />
                  </Box>
                </>
              ) : prediction === undefined && switchFailed === predictionKey(season.season, server) ? (
                <Typography variant="body2" color="error" sx={{ gridArea: "forecast" }}>{t.loadFailed}</Typography>
              ) : prediction === undefined ? (
                <Skeleton variant="rounded" height={160} sx={{ gridArea: "forecast" }} />
              ) : season.state === "upcoming" ? null : (
                <Typography color="text.secondary" sx={{ gridArea: "forecast" }}>
                  {season.state === "live" ? t.noForecast : t.noForecastEnded}
                </Typography>
              )}

              {/* one card per season: in-raid reports up to the close, final results after it;
                  the season before keeps its final-result card until its own window ends. While
                  the raid is live its own card comes first, otherwise the open final window */}
              <Stack id="report" spacing={2.5} sx={{ gridArea: "report", scrollMarginTop: 128 }}>
                {season.state === "live" ? <>{ownCard}{previousCard}</> : <>{previousCard}{ownCard}</>}
              </Stack>

              {data?.history && (
                <Box sx={{ gridArea: "hist" }}>
                  <TrackRecord entries={data.history.entries} server={server} lang={lang} t={t}
                    current={season.season} measuring={ended} />
                </Box>
              )}
            </Box>
          )}

          {data?.history && !season && <TrackRecord entries={data.history.entries} server={server} lang={lang} t={t} />}

          <Stack direction="row" spacing={2} useFlexGap
                 sx={{ justifyContent: "center", flexWrap: "wrap", rowGap: 0.5, pt: 2, pb: 1 }}>
            <Link href="https://enikk.app" target="_blank" rel="noopener" variant="caption" color="text.secondary">
              {t.bossArt}
            </Link>
            <Link href="https://ikken-border.jp/" target="_blank" rel="noopener" variant="caption" color="text.secondary">
              {t.ikkenLink}
            </Link>
            <Link href={ISSUES} target="_blank" rel="noopener" variant="caption" color="text.secondary">
              {t.feedback}
            </Link>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", pb: 2 }}>
            {t.notice}
          </Typography>
        </Stack>
      </Container>
    </>
  );
}
