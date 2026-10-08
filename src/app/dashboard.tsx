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
  SERVERS, health, outbox, type Health, type History, type Prediction, type Season,
} from "@/lib/outbox";
import ReportForm from "./report-form";
import SeasonCard from "./season-card";
import { Distribution, Forecast } from "./server-view";
import TrackRecord from "./track-record";

const REFRESH_MS = 60_000;
const ISSUES = "https://github.com/bobmst/einkk.app/issues/new/choose";
const HTML_LANG: Record<Lang, string> = { en: "en", ja: "ja", ko: "ko", zhs: "zh-Hans", zht: "zh-Hant" };

interface Data {
  health: Health | null;
  season: Season | null;
  predictions: Prediction[];
  history: History | null;
}

async function load(): Promise<Data> {
  const [h, season, history] = await Promise.all([
    health(), outbox<Season>("season.json"), outbox<History>("history.json"),
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
    const refresh = () =>
      load().then(
        (fresh) => {
          if (!alive) return;
          setData(fresh);
          setFailed(false);
        },
        () => alive && setFailed(true),
      );
    refresh();
    const poll = setInterval(refresh, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const t = text(lang);
  const prediction = data?.predictions.find((p) => p.server === server);

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
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
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
            <>
              <SeasonCard key={data.season.season} season={data.season} lang={lang} t={t} now={now} />

              <Box>
                <Typography variant="overline" color="text.secondary">{t.yourServer}</Typography>
                <Tabs value={server} onChange={(_, s) => serverStore.set(s)}
                      variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
                      sx={{ borderBottom: 1, borderColor: "divider" }}>
                  {SERVER_ORDER.map((s) => <Tab key={s} value={s} label={serverName(lang, s)} />)}
                </Tabs>
              </Box>

              {prediction ? (
                <>
                  <Forecast p={prediction} lang={lang} t={t} now={now} />
                  <Distribution p={prediction} lang={lang} t={t} />
                </>
              ) : (
                <Typography color="text.secondary">{t.noForecast}</Typography>
              )}

              <ReportForm key={server} season={data.season} health={data.health} server={server}
                          lang={lang} t={t} />
            </>
          )}

          {data?.history && <TrackRecord entries={data.history.entries} server={server} lang={lang} t={t} />}

          <Stack direction="row" spacing={2} sx={{ justifyContent: "center", pt: 2, pb: 1 }}>
            <Link href="https://enikk.app" target="_blank" rel="noopener" variant="caption" color="text.secondary">
              {t.bossArt}
            </Link>
            <Link href={ISSUES} target="_blank" rel="noopener" variant="caption" color="text.secondary">
              {t.feedback}
            </Link>
          </Stack>
        </Stack>
      </Container>
    </>
  );
}
