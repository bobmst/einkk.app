"use client";
// The live page: everything is read in the browser from the outbox through
// /api/outbox (docs/ARCHITECTURE.md), so a new forecast needs no rebuild.
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  LANG_NAMES,
  LANGS,
  damage,
  elementName,
  langStore,
  serverName,
  stateName,
  text,
  type Lang,
  type Text,
} from "@/lib/i18n";
import {
  SERVERS,
  health,
  outbox,
  type Health,
  type History,
  type HistoryEntry,
  type Prediction,
  type Season,
} from "@/lib/outbox";
import ReportForm from "./report-form";

const REFRESH_MS = 60_000;
const ISSUES = "https://github.com/bobmst/einkk.app/issues/new/choose";

interface Data {
  health: Health | null;
  season: Season | null;
  predictions: Prediction[];
  history: History | null;
}

async function load(): Promise<Data> {
  const [h, season, history] = await Promise.all([
    health(),
    outbox<Season>("season.json"),
    outbox<History>("history.json"),
  ]);
  const predictions = season
    ? (await Promise.all(SERVERS.map((s) => outbox<Prediction>(`predictions/s${season.season}/${s}.json`))))
        .filter((p): p is Prediction => p !== null)
    : [];
  return { health: h, season, predictions, history };
}

export default function Dashboard() {
  const lang = useSyncExternalStore(langStore.subscribe, langStore.get, langStore.server);
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

  const t = text(lang);
  const jp = data?.predictions.find((p) => p.server === "jp");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">einkk.app</h1>
          <p className="text-sm text-zinc-500">{t.tagline}</p>
        </div>
        <div className="flex gap-1 text-sm" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => langStore.set(l)}
              aria-pressed={l === lang}
              className={`rounded px-2 py-1 ${l === lang ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
            >
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      </div>

      {data?.health?.mode === "rehearsal" && (
        <p className="rounded-md border border-amber-500 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t.rehearsal}
        </p>
      )}
      {failed && <p className="text-sm text-red-600">{t.loadFailed}</p>}
      {!data && !failed && <p className="text-zinc-500">{t.loading}</p>}

      {data && !data.season && <p className="text-zinc-500">{t.nothing}</p>}
      {data?.season && <SeasonCard season={data.season} lang={lang} t={t} now={now} />}
      {data?.season && (jp ? <Forecast jp={jp} lang={lang} t={t} now={now} /> : (
        <p className="text-zinc-500">{t.noForecast}</p>
      ))}
      {data && data.predictions.length > 0 && <Servers predictions={data.predictions} lang={lang} t={t} />}
      {data?.season && (
        <ReportForm season={data.season} health={data.health} lang={lang} t={t} />
      )}
      {data?.history && data.history.entries.length > 0 && (
        <TrackRecord entries={data.history.entries} lang={lang} t={t} />
      )}

      <footer className="mt-8 flex flex-col gap-2 text-sm text-zinc-500">
        <a className="underline underline-offset-4" href={ISSUES}>
          {t.footerIssue}
        </a>
        <p>{t.disclaimer}</p>
      </footer>
    </div>
  );
}

function duration(lang: Lang, ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const units = { en: ["d ", "h ", "m"], zh: ["天", "小时", "分"], ja: ["日", "時間", "分"] }[lang];
  return `${d ? d + units[0] : ""}${d || h ? h + units[1] : ""}${m}${units[2]}`.trim();
}

function when(lang: Lang, iso: string): string {
  const locale = { en: "en-US", zh: "zh-CN", ja: "ja-JP" }[lang];
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function SeasonCard({ season, lang, t, now }: { season: Season; lang: Lang; t: Text; now: number }) {
  const ends = Date.parse(season.ends_at) + 60_000;          // ends_at is the last minute
  const starts = Date.parse(season.starts_at);
  const survey = season.survey;
  const surveyOpen = survey && now >= Date.parse(survey.opens_at) && now <= Date.parse(survey.closes_at);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t.season} {season.season} · {season.boss.name}
        </h2>
        <span className="rounded-full bg-zinc-100 px-3 py-0.5 text-sm dark:bg-zinc-800">
          {stateName(lang, season.state)}
        </span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {elementName(lang, season.boss.element)}
        {season.boss.weakness && ` · ${t.weakness} ${elementName(lang, season.boss.weakness)}`}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t.starts} {when(lang, season.starts_at)} · {t.ends} {when(lang, season.ends_at)}
        {season.state === "live" && ` · ${duration(lang, ends - now)} ${t.left}`}
        {season.state === "upcoming" && ` · ${duration(lang, starts - now)} ${t.startsIn}`}
      </p>
      {surveyOpen && (
        <a className="text-sm font-medium underline underline-offset-4" href={survey.url} rel="noopener">
          {t.survey}
        </a>
      )}
    </section>
  );
}

function bandLabel(t: Text, level: number | null): string {
  return level === null ? t.rangeUncertified : `${Math.round(level * 100)}% ${t.range}`;
}

function Forecast({ jp, lang, t, now }: { jp: Prediction; lang: Lang; t: Text; now: number }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-sm font-medium text-zinc-500">
        {serverName(lang, "jp")} · {t.forecastTitle}
      </h2>
      <p className="text-4xl font-semibold tabular-nums">{damage(lang, jp.prediction)}</p>
      <p className="tabular-nums text-zinc-700 dark:text-zinc-300">
        {bandLabel(t, jp.band.level)}: {damage(lang, jp.band.lo)} – {damage(lang, jp.band.hi)}
      </p>
      <p className="text-sm text-zinc-500">
        {t.raidDay(jp.state.raid_day, jp.state.known_days)} · {t.updated}{" "}
        {duration(lang, now - Date.parse(jp.issued_at))} · {t.revision} {jp.revision}
      </p>
    </section>
  );
}

function Servers({ predictions, lang, t }: { predictions: Prediction[]; lang: Lang; t: Text }) {
  const percentiles = [...new Set(predictions.flatMap((p) => (p.cells ?? []).map((c) => c.percentile)))]
    .filter((p) => p !== 3)
    .sort((a, b) => a - b);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.servers}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1 pr-3 font-medium">{t.server}</th>
              <th className="py-1 pr-3 font-medium">{t.border}</th>
              <th className="py-1 font-medium">{t.range}</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p) => (
              <tr key={p.server} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5 pr-3">{serverName(lang, p.server)}</td>
                <td className="py-1.5 pr-3 font-medium">{damage(lang, p.prediction)}</td>
                <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                  {damage(lang, p.band.lo)} – {damage(lang, p.band.hi)}
                  {p.band.level !== null && ` (${Math.round(p.band.level * 100)}%)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {percentiles.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">{t.percentiles}</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full tabular-nums">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t.server}</th>
                  {percentiles.map((pc) => (
                    <th key={pc} className="py-1 pr-3 font-medium">{pc}%</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {predictions.map((p) => (
                  <tr key={p.server} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3">{serverName(lang, p.server)}</td>
                    {percentiles.map((pc) => {
                      const cell = p.cells?.find((c) => c.percentile === pc);
                      return (
                        <td key={pc} className="py-1 pr-3">
                          {cell ? `${cell.extrapolated ? "~" : ""}${cell.value.toFixed(1)}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-zinc-500">{t.extrapolated}</p>
          </div>
        </details>
      )}
    </section>
  );
}

function TrackRecord({ entries, lang, t }: { entries: HistoryEntry[]; lang: Lang; t: Text }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.history}</h2>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="sticky top-0 bg-background text-left text-zinc-500">
            <tr>
              <th className="py-1 pr-3 font-medium">{t.season}</th>
              <th className="py-1 pr-3 font-medium">{t.server}</th>
              <th className="py-1 pr-3 font-medium">{t.forecast}</th>
              <th className="py-1 pr-3 font-medium">{t.error}</th>
              <th className="py-1 font-medium">{t.final}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.season}-${e.server}`} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1 pr-3">{e.season}</td>
                <td className="py-1 pr-3">{serverName(lang, e.server)}</td>
                <td className="py-1 pr-3">
                  {e.forecast !== undefined ? damage(lang, e.forecast) : "—"}
                  {e.band?.method === "t_in_sample_legacy" && (
                    <span className="ml-1 text-xs text-zinc-500" title={t.legacy}>†</span>
                  )}
                </td>
                <td className="py-1 pr-3">
                  {e.grading ? (
                    <span className={e.grading.hit ? "text-emerald-600" : "text-red-600"}
                          title={e.grading.hit ? t.hit : t.miss}>
                      {e.grading.error_pct > 0 ? "+" : ""}{e.grading.error_pct.toFixed(2)}%
                      {e.grading.hit ? " ✓" : " ✗"}
                    </span>
                  ) : e.forecast !== undefined ? (
                    <span className="text-zinc-500">{t.pending}</span>
                  ) : "—"}
                </td>
                <td className="py-1">
                  {e.final ? (
                    <>
                      {damage(lang, e.final.value)}{" "}
                      <span className="text-xs text-zinc-500">
                        {t.sources[e.final.source]}{e.final.n ? `, n=${e.final.n}` : ""}
                      </span>
                    </>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">† {t.legacy}</p>
    </section>
  );
}
