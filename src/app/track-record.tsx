"use client";
// The chosen server's track record from history.json: how far each season's
// forecast landed from the final border (green inside its range, red outside),
// and the final line wherever we measured it ourselves.
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import { damage, serverName, type Lang, type Text } from "@/lib/i18n";
import type { HistoryEntry, Server } from "@/lib/outbox";

const HIT = "#2e9d5b";
const MISS = "#d64545";

export default function TrackRecord({ entries, server, lang, t }: {
  entries: HistoryEntry[]; server: Server; lang: Lang; t: Text;
}) {
  const mine = entries.filter((e) => e.server === server);
  if (mine.length === 0) return null;
  const graded = mine.filter((e) => e.grading).sort((a, b) => a.season - b.season);
  const legacy = mine.some((e) => e.band?.method === "t_in_sample_legacy");

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 1 }}>
          {serverName(lang, server)} · {t.history}
        </Typography>
        {graded.length > 0 && (
          <BarChart
            height={220}
            margin={{ left: 8, right: 8 }}
            xAxis={[{ scaleType: "band", data: graded.map((e) => e.season) }]}
            yAxis={[{ valueFormatter: (v: number) => `${v}%`, width: 40 }]}
            series={[
              { data: graded.map((e) => (e.grading!.hit ? e.grading!.error_pct : null)), stack: "e",
                label: t.hit, color: HIT, valueFormatter: (v) => (v === null ? null : `${v > 0 ? "+" : ""}${v}%`) },
              { data: graded.map((e) => (!e.grading!.hit ? e.grading!.error_pct : null)), stack: "e",
                label: t.miss, color: MISS, valueFormatter: (v) => (v === null ? null : `${v > 0 ? "+" : ""}${v}%`) },
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
                  <TableCell align="right" sx={{ color: e.grading ? (e.grading.hit ? HIT : MISS) : "text.secondary" }}>
                    {e.grading
                      ? `${e.grading.error_pct > 0 ? "+" : ""}${e.grading.error_pct.toFixed(2)}% ${e.grading.hit ? "✓" : "✗"}`
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
      </CardContent>
    </Card>
  );
}
