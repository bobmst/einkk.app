"use client";
// The chosen server's track record from history.json: how far each season's
// forecast landed from the final border (green inside its range, red outside,
// grey where no range was posted), and the final line wherever we have it.
// layout "all" charts every graded season; "ranged" charts only those with a
// range and leaves the rest to the table (rehearsal compares the two).
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { BarChart } from "@mui/x-charts/BarChart";
import { damage, serverName, type Lang, type Text } from "@/lib/i18n";
import type { HistoryEntry, Server } from "@/lib/outbox";

const HIT = "#2e9d5b";
const MISS = "#d64545";
const NONE = "#8a8f98";

type Layout = "all" | "ranged";
const signed = (v: number | null) => (v === null ? null : `${v > 0 ? "+" : ""}${v}%`);

export default function TrackRecord({ entries, server, lang, t, compare = false }: {
  entries: HistoryEntry[]; server: Server; lang: Lang; t: Text; compare?: boolean;
}) {
  const [layout, setLayout] = useState<Layout>("all");
  const mine = entries.filter((e) => e.server === server);
  if (mine.length === 0) return null;
  const graded = mine.filter((e) => e.grading && (layout === "all" || e.grading.hit !== null))
    .sort((a, b) => a.season - b.season);
  const unranged = graded.some((e) => e.grading!.hit === null);
  const legacy = mine.some((e) => e.band?.method === "t_in_sample_legacy");

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 1 }}>
          {serverName(lang, server)} · {t.history}
        </Typography>
        {compare && (
          <ToggleButtonGroup size="small" exclusive value={layout} sx={{ mb: 1 }}
            onChange={(_, v: Layout | null) => v && setLayout(v)}>
            <ToggleButton value="all">A · S15–S20 入图（灰色）</ToggleButton>
            <ToggleButton value="ranged">B · 只画有区间的赛季</ToggleButton>
          </ToggleButtonGroup>
        )}
        {graded.length > 0 && (
          <BarChart
            height={220}
            margin={{ left: 8, right: 8 }}
            xAxis={[{ scaleType: "band", data: graded.map((e) => e.season) }]}
            yAxis={[{ valueFormatter: (v: number) => `${v}%`, width: 40 }]}
            series={[
              { data: graded.map((e) => (e.grading!.hit === true ? e.grading!.error_pct : null)), stack: "e",
                label: t.hit, color: HIT, valueFormatter: signed },
              { data: graded.map((e) => (e.grading!.hit === false ? e.grading!.error_pct : null)), stack: "e",
                label: t.miss, color: MISS, valueFormatter: signed },
              ...(unranged ? [{ data: graded.map((e) => (e.grading!.hit === null ? e.grading!.error_pct : null)),
                stack: "e", label: t.noRange, color: NONE, valueFormatter: signed }] : []),
            ]}
          />
        )}
        <TableContainer sx={{ maxHeight: 360, mt: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>{t.seasonCol}</TableCell>
                <TableCell align="right">{t.histForecast}</TableCell>
                <TableCell align="right">{t.error}</TableCell>
                <TableCell align="right">{t.histFinal}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mine.map((e) => (
                <TableRow key={e.season}>
                  <TableCell>{e.season}</TableCell>
                  <TableCell align="right">
                    {e.forecast !== undefined ? damage(lang, e.forecast) : "—"}
                    {e.band?.method === "t_in_sample_legacy" ? " †" : ""}
                  </TableCell>
                  <TableCell align="right" sx={{ color: !e.grading || e.grading.hit === null ? "text.secondary" : e.grading.hit ? HIT : MISS }}>
                    {e.grading
                      ? `${e.grading.error_pct > 0 ? "+" : ""}${e.grading.error_pct.toFixed(2)}% ${e.grading.hit === null ? "·" : e.grading.hit ? "✓" : "✗"}`
                      : e.forecast !== undefined ? t.pending : "—"}
                  </TableCell>
                  <TableCell align="right">
                    {e.final ? (
                      <>
                        {damage(lang, e.final.value)}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {" "}{t.sources[e.final.source]}{e.final.n ? ` n=${e.final.n}` : ""}
                        </Typography>
                      </>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          {t.histNote}
        </Typography>
        {legacy && <Typography variant="caption" color="text.secondary" component="p">{t.legacy}</Typography>}
        {mine.some((e) => e.grading?.hit === null) && (
          <Typography variant="caption" color="text.secondary" component="p">· {t.noRange}</Typography>
        )}
      </CardContent>
    </Card>
  );
}
