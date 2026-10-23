"use client";
// The live page. Everything is read in the browser from the outbox through
// /api/outbox (docs/ARCHITECTURE.md), so a new forecast needs no rebuild; it
// polls each minute. Each player follows one server: its 3% line, its
// damage-by-rank curve and its track record.
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
  finalWindowOpen, finalsKey, health, latestPrediction, outbox, predictionKey, stateAt,
  type Finals, type Health, type History, type Prediction, type Predictions, type Season, type Server,
} from "@/lib/outbox";
import { saveSnapshot, snapshotStore, type Snapshot } from "@/lib/snapshot";
import { chooseMode } from "@/lib/theme-storage";
import FinalsView from "./finals-view";
import ReportForm from "./report-form";
import SeasonCard from "./season-card";
import { Distribution, Forecast } from "./server-view";
import TrackRecord from "./track-record";

// Every /api request runs the Worker, and the free plan allows 100k a day. The
// engine republishes at most every 15-30 minutes during a raid and a few times a
// day outside one, so a tab checks every 5 minutes while the raid is live, every
// 30 otherwise, and not at all while it is hidden (it catches up when shown).
const LIVE_REFRESH_MS = 5 * 60_000;
const IDLE_REFRESH_MS = 30 * 60_000;
const FAILED_RETRY_MS = 60_000;
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
async function load(server: Server, known?: Health | null): Promise<Data> {
  const [h, season, history, current] = await Promise.all([
    known ?? health(), outbox<Season>("season.json"), outbox<History>("history.json"), latestPrediction(server),
  ]);
  if (!season) return { health: h, season, predictions: {}, history };
  // The Worker's read of season.json and the page's are cached separately (30 s each),
  // so right at a new season they can name different seasons: the page's decides.
  const ended = ["measuring", "closed"].includes(stateAt(season, Date.now()));
  const [prediction, finals] = await Promise.all([
    current && current.season !== season.season ? outbox<Prediction>(predictionKey(season.season, server)) : current,
    ended ? outbox<Finals>(finalsKey(season.season)) : null,
  ]);
  return { health: h, season, predictions: { [server]: prediction }, history, finals };
}

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
  const stale = !loaded && saved !== null;
  const data = loaded ?? saved?.data ?? null;
  const shownAt = loaded ? loadedAt : saved?.saved_at ?? null;
  const [now, setNow] = useState(() => Date.now());
  const followed = useRef(server);                    // the refresh reads it, without restarting
  const fetching = useRef(new Set<string>());
  const [switchFailed, setSwitchFailed] = useState<string | null>(null);   // that forecast's key
  useEffect(() => {
    followed.current = server;
  }, [server]);

  useEffect(() => {
    let alive = true;
    let known: Health | null = null;
    let every = LIVE_REFRESH_MS;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      last = Date.now();
      let ok = false;
      load(followed.current, known).then(
        (fresh) => {
          if (!alive) return;
          ok = true;
          known = fresh.health;
          const at = Date.now();
          const state = fresh.season ? stateAt(fresh.season, at) : null;
          every = state === "live" ? LIVE_REFRESH_MS : IDLE_REFRESH_MS;
          // a page open before the start switches to the live cadence at the start itself
          if (fresh.season && state === "upcoming") {
            every = Math.min(every, Date.parse(fresh.season.starts_at) - at + 5_000);
          }
          setLoaded(fresh);
          setLoadedAt(at);
          setFailed(false);
          saveSnapshot(fresh, at);
        },
        () => alive && setFailed(true),
      ).finally(() => {
        if (alive) timer = setTimeout(() => !document.hidden && refresh(), ok ? every : FAILED_RETRY_MS);
      });
    };
    const onShow = () => {
      if (!document.hidden && Date.now() - last >= every) refresh();
    };
    refresh();
    document.addEventListener("visibilitychange", onShow);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  // a newly followed server's forecast; each refresh then keeps only the followed one
  const seasonNumber = data?.season?.season;
  const missing = seasonNumber !== undefined && !(server in (data?.predictions ?? {}));
  useEffect(() => {
    if (!missing || seasonNumber === undefined || stale) return;   // a first load in flight brings it
    const key = predictionKey(seasonNumber, server);
    if (fetching.current.has(key)) return;
    fetching.current.add(key);
    outbox<Prediction>(key).then(
      (p) => setLoaded((prev) => prev && prev.season?.season === seasonNumber
        ? { ...prev, predictions: { ...prev.predictions, [server]: p } } : prev),
      () => setSwitchFailed(key),                 // shown in the forecast slot; the next refresh retries
    ).finally(() => fetching.current.delete(key));
  }, [missing, seasonNumber, server, stale]);

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
          {failed && !data && <Alert severity="error">{t.loadFailed}</Alert>}
          {failed && data && shownAt !== null && (
            <Alert severity="warning">{t.staleData(duration(lang, now - shownAt))}</Alert>
          )}
          {stale && !failed && shownAt !== null && (
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
              ) : (
                <Typography color="text.secondary" sx={{ gridArea: "forecast" }}>
                  {season.state === "upcoming" ? t.noForecastUpcoming
                    : season.state === "live" ? t.noForecast : t.noForecastEnded}
                </Typography>
              )}

              {/* one card at a time: in-raid reports up to the close, final results after it */}
              {finalWindowOpen(season, now) ? (
                <Box id="report" sx={{ gridArea: "report", scrollMarginTop: 128 }}>
                  <ReportForm key={`final-${server}`} final season={season} health={data?.health ?? null} server={server}
                              predictions={data?.predictions ?? {}}
                              lang={lang} t={t} surveyUrl={season.survey?.url.startsWith("https://tally.so/")
                                && now >= Date.parse(season.survey.opens_at) ? season.survey.url : null} />
                </Box>
              ) : (season.state === "live" || season.state === "upcoming") && (
                <Box id="report" sx={{ gridArea: "report", scrollMarginTop: 128 }}>
                  <ReportForm key={server} season={season} health={data?.health ?? null} server={server}
                              lang={lang} t={t} predictions={data?.predictions ?? {}} />
                </Box>
              )}

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
