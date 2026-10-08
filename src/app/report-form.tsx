"use client";
// In-raid report form, laid out like the season survey on Tally: server, the
// whole damage score as the game shows it (grouped by thousands and echoed
// back in 亿/B to catch a wrong digit count), the rank as a percentage or a
// top-200 number with the same reference images, then a review page and
// Turnstile before it is sent. The Worker checks everything again
// (contracts/report.schema.json, damage in 0.1B).
import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { SERVER_ORDER, damage as fmt, serverName, type Lang, type Text } from "@/lib/i18n";
import { groupDigits, scoreToTenthB } from "@/lib/numbers";
import type { Health, Season, Server } from "@/lib/outbox";

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

function loadTurnstile(): Promise<Turnstile> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : reject()));
    script.addEventListener("error", () => reject());
  });
}

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);                // <input type="datetime-local">
}

type Step = "form" | "review" | "sent";

export default function ReportForm({ season, health, server: followed, lang, t }: {
  season: Season; health: Health | null; server: Server; lang: Lang; t: Text;
}) {
  const [step, setStep] = useState<Step>("form");
  const [server, setServer] = useState<Server>(followed);
  const [score, setScore] = useState("");
  const [mode, setMode] = useState<"pc" | "n" | null>(null);
  const [pct, setPct] = useState("");
  const [num, setNum] = useState("");
  const [readAt, setReadAt] = useState(localNow);
  const [token, setToken] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);         // a new Turnstile widget per try
  const box = useRef<HTMLDivElement>(null);

  const open = season.state === "live" && Boolean(health?.intake && health.turnstile_site_key);

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

  async function submit() {
    if (!token || !tenthB) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server,
          season: season.season,
          ...(mode === "pc" ? { rank_pc: pctNumber } : { rank_n: numNumber }),
          damage: tenthB,
          read_at: new Date(readAt).toISOString(),
          turnstile_token: token,
        }),
      });
      if (response.status === 201) {
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
    setError(null);
    setStep("form");
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 0.5 }}>{t.report}</Typography>
        {!open ? (
          <Typography variant="body2" color="text.secondary">
            {season.state === "live" ? t.reportUnavailable : t.reportClosed}
          </Typography>
        ) : step === "sent" ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Alert severity="success">{t.sent}</Alert>
            <Button variant="outlined" onClick={another}>{t.another}</Button>
          </Stack>
        ) : step === "review" ? (
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t.reviewTitle}</Typography>
            <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5 }}>
              <Typography component="dt" color="text.secondary">{t.server}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{serverName(lang, server)}</Typography>
              <Typography component="dt" color="text.secondary">{t.damageLabel}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{score} ({tenthB ? fmt(lang, tenthB) : ""})</Typography>
              <Typography component="dt" color="text.secondary">{t.rank}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{rankText}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">{t.reviewNote}</Typography>
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
            <Typography variant="body2" color="text.secondary">{t.reportIntro}</Typography>
            <TextField select size="small" label={t.server} value={server}
                       onChange={(e) => setServer(e.target.value as Server)}>
              {SERVER_ORDER.map((s) => <MenuItem key={s} value={s}>{serverName(lang, s)}</MenuItem>)}
            </TextField>

            <Stack spacing={1}>
              <Typography variant="subtitle2">{t.damageLabel}</Typography>
              <Typography variant="body2" color="text.secondary">{t.damageHelp}</Typography>
              <Box component="img" src="/survey/survey_dmg.webp" alt="" sx={{ width: "100%", maxWidth: 480, borderRadius: 1 }} />
              <TextField size="small" value={score} placeholder="23,353,143,363"
                         onChange={(e) => setScore(groupDigits(e.target.value))}
                         slotProps={{ htmlInput: { inputMode: "numeric" } }}
                         error={digits !== "" && !scoreOk} />
              {tenthB && <Typography variant="body2" color="primary">{t.digitsCheck(fmt(lang, tenthB))}</Typography>}
              {digits.endsWith("000") && <Alert severity="warning">{t.roundWarn}</Alert>}
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">{t.rankDisplay}</Typography>
              <Typography variant="body2" color="text.secondary">{t.rankDisplayHelp}</Typography>
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
                <Typography variant="body2" color="text.secondary">{t.pctHelp}</Typography>
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
                <Typography variant="body2" color="text.secondary">{t.numHelp}</Typography>
                <TextField size="small" value={num} placeholder="25"
                           onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
                           slotProps={{ htmlInput: { inputMode: "numeric" } }}
                           error={num !== "" && !rankOk} />
              </Stack>
            )}

            <TextField size="small" type="datetime-local" label={t.readAt} value={readAt}
                       onChange={(e) => setReadAt(e.target.value)}
                       slotProps={{ inputLabel: { shrink: true } }} />
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Button variant="contained" disabled={!scoreOk || !rankOk || !readAt}
                      onClick={() => { setError(null); setStep("review"); }}>
                {t.next}
              </Button>
            </Box>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
