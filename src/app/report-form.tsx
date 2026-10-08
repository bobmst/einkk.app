"use client";
// In-raid report form (contracts/report.schema.json; worker/reports.ts). Numbers
// only: the player picks the server, gives the rank as the game shows it (a
// percentage, or a number in the top 200) and the damage, sees it echoed back
// formatted, and passes Turnstile. The Worker checks everything again.
import { useEffect, useRef, useState } from "react";
import { damage as fmt, serverName, type Lang, type Text } from "@/lib/i18n";
import { SERVERS, type Health, type Season, type Server } from "@/lib/outbox";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
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
  return d.toISOString().slice(0, 16);            // what <input type="datetime-local"> takes
}

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string };

export default function ReportForm({ season, health, lang, t }: {
  season: Season;
  health: Health | null;
  lang: Lang;
  t: Text;
}) {
  const [server, setServer] = useState<Server>("jp");
  const [mode, setMode] = useState<"pc" | "n">("pc");
  const [rank, setRank] = useState("");
  const [value, setValue] = useState("");
  const [readAt, setReadAt] = useState(localNow);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  const open = season.state === "live" && Boolean(health?.intake && health.turnstile_site_key);

  useEffect(() => {
    if (!open || !box.current || widget.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current || widget.current) return;
        widget.current = ts.render(box.current, {
          sitekey: health?.turnstile_site_key,
          callback: (tok: string) => setToken(tok),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => setStatus({ kind: "error", message: t.reportUnavailable }));
    return () => {
      cancelled = true;
    };
  }, [open, health?.turnstile_site_key, t.reportUnavailable]);

  const rankNumber = Number(rank);
  const damageNumber = Number(value);
  const rankOk = rank !== "" && (mode === "pc"
    ? rankNumber > 0 && rankNumber <= 100
    : Number.isInteger(rankNumber) && rankNumber >= 1 && rankNumber <= 200);
  const damageOk = value !== "" && damageNumber > 0 && damageNumber <= 100000;
  const ready = rankOk && damageOk && readAt !== "" && token !== null && status.kind !== "sending";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setStatus({ kind: "sending" });
    const body = {
      server,
      season: season.season,
      ...(mode === "pc" ? { rank_pc: rankNumber } : { rank_n: rankNumber }),
      damage: damageNumber,
      read_at: new Date(readAt).toISOString(),
      turnstile_token: token,
    };
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        setStatus({ kind: "sent" });
        setRank("");
        setValue("");
      } else {
        const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
        const errors = t.errors as Record<string, string>;
        setStatus({ kind: "error", message: (code && errors[code]) || t.errors.other });
      }
    } catch {
      setStatus({ kind: "error", message: t.errors.other });
    }
    setToken(null);                                  // a token is single-use
    if (widget.current) window.turnstile?.reset(widget.current);
  }

  const field = "rounded border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-700";

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">{t.report}</h2>
      {!open ? (
        <p className="text-sm text-zinc-500">
          {season.state === "live" ? t.reportUnavailable : t.reportClosed}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
          <p className="text-zinc-500">{t.reportHelp}</p>
          <label className="flex flex-col gap-1">
            {t.server}
            <select className={field} value={server} onChange={(e) => setServer(e.target.value as Server)}>
              {SERVERS.map((s) => (
                <option key={s} value={s}>{serverName(lang, s)}</option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="mb-1">{t.rankBy}</legend>
            <label className="flex items-center gap-1">
              <input type="radio" name="mode" checked={mode === "pc"} onChange={() => setMode("pc")} />
              {t.percent}
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="mode" checked={mode === "n"} onChange={() => setMode("n")} />
              {t.number}
            </label>
          </fieldset>
          <label className="flex flex-col gap-1">
            {t.rank} {mode === "pc" ? "(%)" : "(#)"}
            <input className={field} inputMode="decimal" value={rank}
                   onChange={(e) => setRank(e.target.value.trim())}
                   placeholder={mode === "pc" ? "2.75" : "120"} />
          </label>
          <label className="flex flex-col gap-1">
            {t.damage}
            <input className={field} inputMode="decimal" value={value}
                   onChange={(e) => setValue(e.target.value.trim())} placeholder="223.16" />
          </label>
          <label className="flex flex-col gap-1">
            {t.readAt}
            <input className={field} type="datetime-local" value={readAt}
                   onChange={(e) => setReadAt(e.target.value)} />
          </label>
          {rankOk && damageOk && (
            <p className="rounded bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
              {t.confirm}: <strong>{serverName(lang, server)}</strong> ·{" "}
              <strong>{mode === "pc" ? `${rankNumber}%` : `#${rankNumber}`}</strong> ·{" "}
              <strong>{fmt(lang, damageNumber)}</strong>
              {lang === "en" && ` (${damageNumber} × 100M)`}
            </p>
          )}
          <div ref={box} />
          <button type="submit" disabled={!ready}
                  className="rounded bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900">
            {status.kind === "sending" ? t.sending : t.send}
          </button>
          {status.kind === "sent" && <p className="text-emerald-600">{t.sent}</p>}
          {status.kind === "error" && <p className="text-red-600">{status.message}</p>}
        </form>
      )}
    </section>
  );
}
