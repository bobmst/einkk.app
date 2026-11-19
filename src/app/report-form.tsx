"use client";
// In-raid report form, laid out like the season survey on Tally: server, the
// whole damage score as the game shows it (grouped by thousands and echoed
// back in 亿/B to catch a wrong digit count), the rank as a percentage or a
// top-200 number with the same reference images, then a review page and
// Turnstile before it is sent. The Worker checks everything again
// (contracts/report.schema.json, damage in 0.1B).
//
// With `final`, the same form takes a closed season's final result instead
// (/api/finals, contracts/final-report.schema.json): its own title, colour and
// marker so nobody mistakes it for an in-raid report, no read time, and a
// random browser id kept in localStorage, which the Worker hashes to count
// distinct players. That season may be the one before the published one
// (Season.previous), whose final window outlasts the next season's announcement.
import { frozenAt } from "@/lib/clock";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { SERVER_ORDER, damage as fmt, serverName, type Lang, type Text } from "@/lib/i18n";
import { digitCheck, regroupField, scoreToTenthB } from "@/lib/numbers";
import { lastReport } from "@/lib/last-report";
import { reportPrefill } from "@/lib/check-record";
import { tooNew } from "@/lib/versions";
import { outbox, predictionKey, type Health, type Prediction, type Predictions, type Season, type Server } from "@/lib/outbox";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const MIN_SCORE = 10_000_000;          // the survey's bounds
const MAX_SCORE = 999_999_999_999;

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// One load shared by every review page. A script tag's load/error fire only once,
// so a later caller can't wait on the tag itself; a failed load drops both the tag
// and the promise, and the next review page tries afresh.
let turnstileLoad: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileLoad ??= new Promise<Turnstile>((resolve, reject) => {
    document.querySelectorAll(`script[src="${TURNSTILE_SRC}"]`).forEach((s) => s.remove());
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    const fail = () => {
      script.remove();
      turnstileLoad = null;
      reject(new Error("turnstile script failed to load"));
    };
    script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : fail()));
    script.addEventListener("error", fail);
    document.head.appendChild(script);
  });
  return turnstileLoad;
}

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);                // <input type="datetime-local">
}

/** The instant a datetime-local value names, in this browser's zone. Built from its parts:
 *  `new Date("YYYY-MM-DDTHH:mm")` is local time in current browsers but UTC in older Safari
 *  and some in-app webviews, which stored a UTC+8 player's read time 8 hours late (#110). */
export function fromLocal(value: string): Date {
  const [date, time = "00:00"] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

const READ_AHEAD_MS = 60_000;                         // a clock a minute fast is still "now"

type Step = "form" | "review" | "sent";

const BROWSER_ID = "einkk.browser-id";

function browserId(): string {
  let id = localStorage.getItem(BROWSER_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID, id);
  }
  return id;
}

// The form's server field: the page's server, and picking one is the page's onServer (#96).
export function ServerSelect({ server, onServer, lang, label }: {
  server: Server; onServer: (server: Server) => void; lang: Lang; label: string;
}) {
  return (
    <TextField select size="small" label={label} value={server}
               onChange={(e) => onServer(e.target.value as Server)}>
      {SERVER_ORDER.map((s) => <MenuItem key={s} value={s}>{serverName(lang, s)}</MenuItem>)}
    </TextField>
  );
}

// One current server on the page (#96): the form shows the page's server and picking one here
// switches the page (tabs, forecast) through onServer. It keeps no copy of its own, so the two
// can't disagree, and the form keeps what was typed when the server changes.
export default function ReportForm({ season, health, server, onServer, lang, t, final = false, surveyUrl,
  predictions }: {
  season: Pick<Season, "season" | "state">; health: Health | null; server: Server;
  onServer: (server: Server) => void; lang: Lang; t: Text;
  final?: boolean; surveyUrl?: string | null;
  predictions?: Predictions;      // the page's forecasts for this season; without them the form fetches its own
}) {
  const [step, setStep] = useState<Step>("form");
  const [score, setScore] = useState("");
  const [mode, setMode] = useState<"pc" | "n" | null>(null);
  const [pct, setPct] = useState("");
  const [num, setNum] = useState("");
  const [readAt, setReadAt] = useState(localNow);
  const [timeSet, setTimeSet] = useState(false);       // until changed, "now" is when Next is pressed
  const [token, setToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);         // a new Turnstile widget per try
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<Step>(step);
  const [others, setOthers] = useState<Predictions>({});
  // #98: the damage this browser last reported for this season and server, offered again
  const remembered = useSyncExternalStore(lastReport.subscribe,
    () => (final ? null : lastReport.get(season.season, server)), () => null);   // forecasts the page doesn't hold (another season's)

  // #100: the checker's "What is your rank now?" hands over its damage; the in-raid form takes it
  // (the form is already on the page then: it is keyed by season, not by server)
  useEffect(() => {
    if (final) return;
    return reportPrefill.subscribe(() => {
      const handed = reportPrefill.get();
      if (handed === null) return;
      reportPrefill.clear();
      setScore(handed);
      setStep("form");
    });
  }, [final]);

  // On a phone the form is far taller than the review and sent steps. After Next the
  // browser keeps its scroll position, so the shorter card ends up above the screen
  // and a first-time player misses the review and Turnstile. On every step change,
  // bring the card's top back under the sticky header (its scroll-margin) and move
  // focus to its heading.
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    const el = card.current;
    if (!el) return;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    if (el.getBoundingClientRect().top < margin) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  // a frozen preview clock (src/lib/clock.ts): the intake checks the real time, so no form
  const frozen = frozenAt() !== null;
  const open = !frozen && (final || season.state === "live") && Boolean(health?.intake && health.turnstile_site_key);

  // Turnstile only on the review page, fresh each time it opens
  useEffect(() => {
    if (step !== "review" || !box.current) return;
    let id: string | null = null;
    let cancelled = false;
    loadTurnstile().then((ts) => {
      if (cancelled || !box.current) return;
      id = ts.render(box.current, {
        sitekey: health?.turnstile_site_key,
        callback: (tok: string) => setToken(tok),
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    }, () => setError(t.reportUnavailable));
    return () => {
      cancelled = true;
      setToken(null);
      if (id) window.turnstile?.remove(id);
    };
  }, [step, attempt, health?.turnstile_site_key, t.reportUnavailable]);

  const digits = score.replace(/\D/g, "");
  const scoreNumber = Number(digits);
  const scoreOk = digits !== "" && scoreNumber >= MIN_SCORE && scoreNumber <= MAX_SCORE;
  const tenthB = scoreToTenthB(score);
  const pctNumber = Number(pct);
  const numNumber = Number(num);
  const rankOk = mode === "pc" ? pct !== "" && pctNumber >= 0.01 && pctNumber <= 100
    : mode === "n" ? num !== "" && Number.isInteger(numNumber) && numNumber >= 1 && numNumber <= 200 : false;
  const rankText = mode === "pc" ? `${pct}%` : `#${num}`;

  // a score a digit short or long for its rank, against the chosen server's curve
  // and how far the raid has come (a numeric rank is a top-200 one: the top cell)
  // the page's forecasts when it has this season's (it fetches the current server's itself); only the
  // closing season's final-results card, which the page holds no forecasts for, fetches its own
  const forecast = (predictions ? predictions[server] : others[server]) ?? undefined;
  const fetchOther = !predictions && !(server in others);
  useEffect(() => {
    if (!fetchOther) return;
    let alive = true;
    outbox<Prediction>(predictionKey(season.season, server)).then(
      // a forecast from a newer contract than this page reads gives no digit check (#90)
      (p) => alive && setOthers((o) => ({ ...o, [server]: tooNew(p) ? null : p })),
      () => alive && setOthers((o) => ({ ...o, [server]: null })),   // no digit check then, and no retry loop
    );
    return () => { alive = false; };
  }, [fetchOther, season.season, server]);
  // how far the line has come, as the engine published it (#89); without it no "low" check
  const progress = final ? 1 : forecast?.state.line_progress ?? null;
  const digitWarning = forecast?.cells && tenthB && rankOk
    ? digitCheck(forecast.cells, mode === "pc" ? pctNumber : 0, tenthB, progress) : null;

  async function submit() {
    if (!token || !tenthB) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(final ? "/api/finals" : "/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server,
          season: season.season,
          ...(mode === "pc" ? { rank_pc: pctNumber } : { rank_n: numNumber }),
          damage: tenthB,
          ...(final ? { browser_id: browserId() } : { read_at: fromLocal(readAt).toISOString() }),
          turnstile_token: token,
        }),
      });
      if (response.status === 201) {
        if (!final) lastReport.set(season.season, server, score);
        setStep("sent");
      } else {
        const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
        setError((code && t.errors[code]) || t.errors.other);
        setAttempt((n) => n + 1);                        // tokens are single-use
      }
    } catch {
      setError(t.errors.other);
      setAttempt((n) => n + 1);
    }
    setSending(false);
  }

  function another() {
    setScore("");
    setPct("");
    setNum("");
    setMode(null);
    setReadAt(localNow());
    setTimeSet(false);
    setError(null);
    setStep("form");
  }

  return (
    <Card ref={card} sx={{ scrollMarginTop: 128,             // the sticky AppBar and server tabs
      ...(final ? { borderColor: "secondary.main", borderWidth: 2, bgcolor: "action.hover" } : {}) }}>
      <CardContent>
        {final && <Chip size="small" color="secondary" label={t.finalChip} sx={{ mb: 1 }} />}
        <Typography ref={heading} tabIndex={-1} variant="h2" sx={{ mb: 0.5, "&:focus": { outline: "none" } }}>
          {final ? t.finalTitle(season.season) : t.report}
        </Typography>
        {!open ? (
          <Typography variant="muted">
            {frozen ? t.reportFrozen : season.state === "live" ? t.reportUnavailable : t.reportClosed}
          </Typography>
        ) : step === "sent" ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Alert severity="success">{final ? t.finalSent : t.sent}</Alert>
            <Button variant="outlined" onClick={another}>{t.another}</Button>
          </Stack>
        ) : step === "review" ? (
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t.reviewTitle}</Typography>
            <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}>
              <Typography component="dt" variant="mutedLarge">{t.server}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{serverName(lang, server)}</Typography>
              <Typography component="dt" variant="mutedLarge">{t.damageLabel}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{score} ({tenthB ? fmt(lang, tenthB) : ""})</Typography>
              <Typography component="dt" variant="mutedLarge">{t.rank}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{rankText}</Typography>
            </Box>
            {digitWarning && <Alert severity="warning">{digitWarning === "low" ? t.digitsLow : t.digitsHigh}</Alert>}
            <Typography variant="muted">{t.reviewNote}</Typography>
            <div ref={box} />
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setStep("form")}>{t.back}</Button>
              <Button variant="contained" disabled={!token || sending} onClick={submit}>
                {sending ? t.sending : t.submit}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Typography variant="muted">{final ? t.finalIntro : t.reportIntro}</Typography>
            {!final && (
              // extra guidance, set back from the intro: smaller and lighter, tucked under it
              <Typography variant="note" sx={{ mt: -1.5 }}>
                {t.reportNearLine}
              </Typography>
            )}
            {remembered && score === "" && (
              <Alert severity="info" action={
                <Stack direction="row" spacing={0.5}>
                  <Button color="inherit" size="small" onClick={() => setScore(remembered)}>{t.rereportUse}</Button>
                  <Button color="inherit" size="small"
                          onClick={() => lastReport.forget(season.season, server)}>{t.rereportDismiss}</Button>
                </Stack>
              }>
                {t.rereport(remembered)}
              </Alert>
            )}
            {final && surveyUrl && (
              <Link href={surveyUrl} target="_blank" rel="noopener" variant="body2">{t.finalOrSurvey}</Link>
            )}
            <ServerSelect server={server} onServer={onServer} lang={lang} label={t.server} />

            <Stack spacing={1}>
              <Typography variant="subtitle2">{t.damageLabel}</Typography>
              <Typography variant="muted">{t.damageHelp}</Typography>
              <Box component="img" src="/survey/survey_dmg.webp" alt="" sx={{ width: "100%", maxWidth: 480, borderRadius: 1 }} />
              <TextField size="small" value={score} placeholder="23,353,143,363"
                         onChange={(e) => setScore(regroupField(e, score))}
                         slotProps={{ htmlInput: { inputMode: "numeric" } }}
                         error={digits !== "" && !scoreOk} />
              {tenthB && <Typography variant="body2" color="primary">{t.digitsCheck(fmt(lang, tenthB))}</Typography>}
              {digits.endsWith("000") && <Alert severity="warning">{t.roundWarn}</Alert>}
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">{t.rankDisplay}</Typography>
              <Typography variant="muted">{t.rankDisplayHelp}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {([["pc", "%  —  0.83%", "/survey/survey_percent.webp"], ["n", "#  —  200", "/survey/survey_rank.webp"]] as const)
                  .map(([value, label, image]) => (
                    <Card key={value} sx={{ flex: 1, borderColor: mode === value ? "primary.main" : undefined, borderWidth: mode === value ? 2 : 1 }}>
                      <CardActionArea onClick={() => setMode(value)} sx={{ p: 1 }}>
                        <Box component="img" src={image} alt="" sx={{ width: "100%", borderRadius: 1 }} />
                        <Typography sx={{ mt: 0.5, fontWeight: 600 }}>{label}</Typography>
                      </CardActionArea>
                    </Card>
                  ))}
              </Stack>
            </Stack>

            {mode === "pc" && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">{t.pctLabel}</Typography>
                <Typography variant="muted">{t.pctHelp}</Typography>
                <TextField size="small" value={pct} placeholder="3.00"
                           onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))}
                           slotProps={{ htmlInput: { inputMode: "decimal" } }}
                           error={pct !== "" && !rankOk} />
                {pct !== "" && pctNumber > 0 && pctNumber < 0.1 && <Alert severity="warning">{t.pctLowWarn}</Alert>}
              </Stack>
            )}
            {mode === "n" && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">{t.numLabel}</Typography>
                <Typography variant="muted">{t.numHelp}</Typography>
                <TextField size="small" value={num} placeholder="25"
                           onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
                           slotProps={{ htmlInput: { inputMode: "numeric" } }}
                           error={num !== "" && !rankOk} />
              </Stack>
            )}

            {!final && (timeSet ? (
              <TextField size="small" type="datetime-local" label={t.readAt} value={readAt}
                         onChange={(e) => setReadAt(e.target.value)}
                         slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: localNow() } }} />
            ) : (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
                <Typography variant="muted">{t.readAtNow(localNow().slice(11, 16))}</Typography>
                <Link component="button" type="button" variant="body2"
                      onClick={() => { setReadAt(localNow()); setTimeSet(true); }}>
                  {t.readAtChange}
                </Link>
              </Stack>
            ))}
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Button variant="contained" disabled={!scoreOk || !rankOk || (!final && !readAt)}
                      onClick={() => {
                        if (!final && !timeSet) setReadAt(localNow());
                        if (!final && timeSet && fromLocal(readAt).getTime() > Date.now() + READ_AHEAD_MS) {
                          setError(t.readAtFuture);
                          return;
                        }
                        setError(null);
                        setStep("review");
                      }}>
                {t.next}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
