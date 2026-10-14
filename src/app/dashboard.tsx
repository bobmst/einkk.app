"use client";
// The live page. Everything is read in the browser from the outbox through
// /api/outbox (docs/ARCHITECTURE.md), so a new forecast needs no rebuild; it
// polls each minute. Each player follows one server: its 3% line, its
// damage-by-rank curve and its track record.
import { useEffect, useState, useSyncExternalStore } from "react";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
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
  LANG_NAMES, LANGS, SERVER_ORDER, langStore, serverName, serverStore, text, type Lang,
} from "@/lib/i18n";
import {
  SERVERS, finalWindowOpen, health, outbox, type Health, type History, type Prediction, type Season,
} from "@/lib/outbox";
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
const ISSUES = "https://github.com/bobmst/einkk.app/issues/new/choose";
const HTML_LANG: Record<Lang, string> = { en: "en", ja: "ja", ko: "ko", zhs: "zh-Hans", zht: "zh-Hant", es: "es" };

interface Data {
  health: Health | null;
  season: Season | null;
  predictions: Prediction[];
  history: History | null;
}

// health (site mode, Turnstile key) doesn't change while the page is open: fetched once
async function load(known?: Health | null): Promise<Data> {
  const [h, season, history] = await Promise.all([
    known ?? health(), outbox<Season>("season.json"), outbox<History>("history.json"),
  ]);
  const predictions = season
    ? (await Promise.all(SERVERS.map((s) => outbox<Prediction>(`predictions/s${season.season}/${s}.json`))))
        .filter((p): p is Prediction => p !== null)
    : [];
  return { health: h, season, predictions, history };
}

function ThemeToggle({ label }: { label: string }) {
  const { mode, systemMode, setMode } = useColorScheme();
  if (!mode) return <Box sx={{ width: 40 }} />;           // not resolved before hydration
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  return (
    <Tooltip title={label}>
      <IconButton onClick={() => setMode(dark ? "light" : "dark")} aria-label={label}>
        {dark ? <LightModeOutlined /> : <DarkModeOutlined />}
      </IconButton>
    </Tooltip>
  );
}

export default function Dashboard() {
  const lang = useSyncExternalStore(langStore.subscribe, langStore.get, langStore.server);
  const picked = useSyncExternalStore(serverStore.subscribe, serverStore.get, serverStore.server);
  const server = picked ?? serverStore.fallback(lang);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    let known: Health | null = null;
    let every = LIVE_REFRESH_MS;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      last = Date.now();
      load(known).then(
        (fresh) => {
          if (!alive) return;
          known = fresh.health;
          every = fresh.season?.state === "live" ? LIVE_REFRESH_MS : IDLE_REFRESH_MS;
          setData(fresh);
          setFailed(false);
        },
        () => alive && setFailed(true),
      ).finally(() => {
        if (alive) timer = setTimeout(() => !document.hidden && refresh(), every);
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

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const t = text(lang);
  const prediction = data?.predictions.find((p) => p.server === server);
  const ended = data?.season?.state === "measuring" || data?.season?.state === "closed";
  // From lg (1200px) the page splits in two: the season, the forecast and the report
  // card on the left, the distribution beside them. Without a forecast, or once the raid
  // has closed (no distribution then), there is no second column.
  const wide = Boolean(data?.season && prediction && !ended);
  const pageWidth = { md: 900, lg: wide ? 1240 : 900 };
  const one = `"season" "forecast" "dist" "report" "hist"`;
  const reportOpen = data?.season?.state === "live" && !finalWindowOpen(data.season, now);

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
        {data?.season && (
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
          {failed && <Alert severity="error">{t.loadFailed}</Alert>}
          {!data && !failed && (
            <Stack spacing={2}>
              <Skeleton variant="rounded" height={240} />
              <Skeleton variant="rounded" height={160} />
            </Stack>
          )}
          {data && !data.season && <Typography color="text.secondary">{t.nothing}</Typography>}

          {data?.season && (
            <Box sx={{
              display: "grid", gap: 2.5, alignItems: "start",
              gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: wide ? "minmax(0, 5fr) minmax(0, 7fr)" : "minmax(0, 1fr)" },
              gridTemplateAreas: { xs: one, lg: wide ? `"season dist" "forecast dist" "report dist" "hist hist"` : one },
              gridTemplateRows: { lg: wide ? "auto auto 1fr auto" : "none" },
            }}>
              <Box sx={{ gridArea: "season" }}>
                <SeasonCard key={data.season.season} season={data.season} lang={lang} t={t} now={now} />
              </Box>

              {prediction ? (
                <>
                  <Box sx={{ gridArea: "forecast" }}>
                    <Forecast p={prediction} lang={lang} t={t} now={now} report={reportOpen} ended={ended} />
                  </Box>
                  {/* after the close the forecast table would only invite players to report its
                      numbers back as their final results: hidden until a measured one exists */}
                  {ended ? (
                    <Typography variant="body2" color="text.secondary" sx={{ gridArea: "dist" }}>
                      {t.distAfterClose}
                    </Typography>
                  ) : (
                    <Box sx={{ gridArea: "dist" }}>
                      <Distribution p={prediction} lang={lang} t={t} />
                    </Box>
                  )}
                </>
              ) : (
                <Typography color="text.secondary" sx={{ gridArea: "forecast" }}>
                  {data.season.state === "upcoming" ? t.noForecastUpcoming
                    : data.season.state === "live" ? t.noForecast : t.noForecastEnded}
                </Typography>
              )}

              {/* one card at a time: in-raid reports up to the close, final results after it */}
              {finalWindowOpen(data.season, now) ? (
                <Box id="report" sx={{ gridArea: "report", scrollMarginTop: 128 }}>
                  <ReportForm key={`final-${server}`} final season={data.season} health={data.health} server={server}
                              predictions={data.predictions}
                              lang={lang} t={t} surveyUrl={data.season.survey?.url.startsWith("https://tally.so/")
                                && now >= Date.parse(data.season.survey.opens_at) ? data.season.survey.url : null} />
                </Box>
              ) : (data.season.state === "live" || data.season.state === "upcoming") && (
                <Box id="report" sx={{ gridArea: "report", scrollMarginTop: 128 }}>
                  <ReportForm key={server} season={data.season} health={data.health} server={server}
                              lang={lang} t={t} predictions={data.predictions} />
                </Box>
              )}

              {data.history && (
                <Box sx={{ gridArea: "hist" }}>
                  <TrackRecord entries={data.history.entries} server={server} lang={lang} t={t}
                    current={data.season.season} />
                </Box>
              )}
            </Box>
          )}

          {data?.history && !data.season && <TrackRecord entries={data.history.entries} server={server} lang={lang} t={t} />}

          <Stack direction="row" spacing={2} sx={{ justifyContent: "center", pt: 2, pb: 1 }}>
            <Link href="https://enikk.app" target="_blank" rel="noopener" variant="caption" color="text.secondary">
              {t.bossArt}
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
