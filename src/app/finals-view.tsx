"use client";
// After the close (solo_raid_predict #63): while final results come in, only how many
// there are; once the season has settled, the season's 3% line, our forecast against it
// when the line is confirmed, and the curve through players' results when there are
// enough of them near 3%. finals/s<n>.json carries no number before it settles.
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { ChartsContainer } from "@mui/x-charts/ChartsContainer";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { ChartsXAxis } from "@mui/x-charts/ChartsXAxis";
import { ChartsYAxis } from "@mui/x-charts/ChartsYAxis";
import { LinePlot } from "@mui/x-charts/LineChart";
import { ScatterPlot } from "@mui/x-charts/ScatterChart";
import { damage, duration, serverName, type Lang, type Text } from "@/lib/i18n";
import { axisDamage } from "@/lib/numbers";
import type { Cell, Finals, FinalsServer, HistoryEntry, Server } from "@/lib/outbox";

const CONFIRM_PLAYERS = 3;                    // results inside 2.85-3.15% that confirm a line

export default function FinalsView({ finals, server, entry, lang, t, now }: {
  finals: Finals; server: Server; entry?: HistoryEntry; lang: Lang; t: Text; now: number;
}) {
  const s = finals.servers.find((x) => x.server === server);
  const players = s?.players ?? 0;
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {serverName(lang, server)} · {t.finalsTitle}
        </Typography>
        {!finals.settled || !s?.line ? (
          <Box sx={{ mt: 0.5 }}>
            <Typography>{players ? t.finalsCollecting(players) : t.finalsNone}</Typography>
            {players > 0 && server !== "jp" && (
              <Typography variant="body2" color="text.secondary">
                {t.finalsNear3(s?.near_3 ?? 0, CONFIRM_PLAYERS)}
              </Typography>
            )}
            {!finals.settled && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {now < Date.parse(finals.settles_at)
                  ? t.finalsReveal(duration(lang, Date.parse(finals.settles_at) - now)) : t.finalsRevealSoon}
              </Typography>
            )}
          </Box>
        ) : (
          <Settled s={s} line={s.line} server={server} entry={entry} lang={lang} t={t} />
        )}
      </CardContent>
    </Card>
  );
}

function Settled({ s, line, server, entry, lang, t }: {
  s: FinalsServer; line: { value: number; confirmed: boolean }; server: Server; entry?: HistoryEntry;
  lang: Lang; t: Text;
}) {
  const forecast = entry?.forecast;
  const grading = line.confirmed ? entry?.grading : null;
  return (
    <>
      <Typography sx={{ fontSize: { xs: "2.4rem", sm: "3rem" }, fontWeight: 700, lineHeight: 1.1 }}>
        {line.confirmed ? "" : "≈ "}{damage(lang, line.value)}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p">
        {server === "jp" ? t.finalsJp : t.finalsFrom(s.players)}
      </Typography>
      {!line.confirmed && (
        <Typography variant="caption" color="text.secondary" component="p">{t.finalsUnconfirmed}</Typography>
      )}
      {forecast !== undefined && grading && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2">
            {t.finalsForecast(damage(lang, forecast),
              entry?.band ? `${damage(lang, entry.band.lo)} – ${damage(lang, entry.band.hi)}` : "—")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600,
            color: grading.hit === null ? "text.secondary" : grading.hit ? "success.main" : "error.main" }}>
            {t.finalsError(`${grading.error_pct > 0 ? "+" : ""}${grading.error_pct.toFixed(2)}%`, grading.hit)}
          </Typography>
        </Box>
      )}
      {s.points && s.cells && <Curve points={s.points} cells={s.cells} line={line.value} lang={lang} t={t} />}
    </>
  );
}

function Curve({ points, cells, line, lang, t }: {
  points: NonNullable<FinalsServer["points"]>; cells: Cell[];
  line: number; lang: Lang; t: Text;
}) {
  const theme = useTheme();
  const sorted = [...cells].sort((a, b) => a.percentile - b.percentile);
  const pcts = sorted.map((c) => c.percentile);
  // the axis spans the tiers; a result beyond them would squash the curve, so it stays off
  const shown = points.filter((p) => p.rank_pc >= pcts[0] && p.rank_pc <= pcts[pcts.length - 1]);
  const ys = [...sorted.map((c) => c.value), ...shown.map((p) => p.damage)];
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2">{t.finalsCurveTitle}</Typography>
      <Box sx={{ mx: -1 }}>
        <ChartsContainer
          height={280}
          margin={{ left: 8, right: 16 }}
          xAxis={[{ id: "pct", data: pcts, scaleType: "log", label: t.topPct, tickInterval: pcts,
                    valueFormatter: (v: number) => `${v}%` }]}
          yAxis={[{ id: "dmg", min: Math.min(...ys) * 0.95, max: Math.max(...ys) * 1.03,
                    valueFormatter: (v: number) => axisDamage(lang, v), width: 48 }]}
          series={[
            { type: "line", id: "curve", data: sorted.map((c) => c.value), color: theme.palette.primary.main,
              showMark: false },
            { type: "scatter", id: "results", markerSize: 4, color: theme.palette.warning.main,
              data: shown.map((p, i) => ({ id: i, x: p.rank_pc, y: p.damage })) },
          ]}
        >
          <LinePlot />
          <ScatterPlot />
          <ChartsReferenceLine y={line} lineStyle={{ strokeDasharray: "4 4" }} />
          <ChartsXAxis axisId="pct" />
          <ChartsYAxis axisId="dmg" />
        </ChartsContainer>
      </Box>
      <Typography variant="caption" color="text.secondary">{t.finalsPoints}</Typography>
      <Table size="small" sx={{ mt: 1.5 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t.tier}</TableCell>
            <TableCell align="right">{t.damage}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((c) => (
            <TableRow key={c.percentile}>
              <TableCell>{c.percentile}%</TableCell>
              <TableCell align="right">{c.extrapolated ? "~" : ""}{damage(lang, c.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sorted.some((c) => c.extrapolated) && (
        <Typography variant="caption" color="text.secondary">{t.estimated}</Typography>
      )}
    </Box>
  );
}
