"use client";
// One server's forecast: the 3% line with its range, the damage-by-rank curve,
// and where the player's own damage would land on it.
import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { LineChart } from "@mui/x-charts/LineChart";
import { damage, duration, serverName, type Lang, type Text } from "@/lib/i18n";
import { axisDamage, groupDigits, placement, scoreToTenthB } from "@/lib/numbers";
import type { Prediction } from "@/lib/outbox";

function rangeLabel(t: Text, level: number | null) {
  return level === null ? t.rangeUncertified : t.range(Math.round(level * 100));
}

/** The range as a bar: the band filled, the forecast marked. */
function RangeBar({ lo, hi, value }: { lo: number; hi: number; value: number }) {
  const pad = (hi - lo) * 0.35 || 1;
  const min = lo - pad;
  const span = hi + pad - min;
  const at = (v: number) => `${((v - min) / span) * 100}%`;
  return (
    <Box sx={{ position: "relative", height: 14, my: 1.5, borderRadius: 7, bgcolor: "action.hover" }}>
      <Box sx={{ position: "absolute", top: 0, bottom: 0, left: at(lo), width: `calc(${at(hi)} - ${at(lo)})`,
                 borderRadius: 7, bgcolor: "primary.main", opacity: 0.3 }} />
      <Box sx={{ position: "absolute", top: -3, bottom: -3, left: at(value), width: 4, ml: "-2px",
                 borderRadius: 2, bgcolor: "primary.main" }} />
    </Box>
  );
}

export function Forecast({ p, lang, t, now }: { p: Prediction; lang: Lang; t: Text; now: number }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {serverName(lang, p.server)} · {t.forecastTitle}
        </Typography>
        <Typography sx={{ fontSize: { xs: "2.4rem", sm: "3rem" }, fontWeight: 700, lineHeight: 1.1 }}>
          {damage(lang, p.prediction)}
        </Typography>
        <RangeBar lo={p.band.lo} hi={p.band.hi} value={p.prediction} />
        <Typography variant="body2">
          {rangeLabel(t, p.band.level)}: {damage(lang, p.band.lo)} – {damage(lang, p.band.hi)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t.raidDay(p.state.raid_day)} · {t.updated(duration(lang, now - Date.parse(p.issued_at)))}
        </Typography>
      </CardContent>
    </Card>
  );
}

export function Distribution({ p, lang, t }: { p: Prediction; lang: Lang; t: Text }) {
  const theme = useTheme();
  const [mine, setMine] = useState("");
  const cells = [...(p.cells ?? [])].sort((a, b) => a.percentile - b.percentile);
  if (cells.length < 2) return null;
  const pcts = cells.map((c) => c.percentile);
  const hasBand = cells.every((c) => c.lo !== undefined && c.hi !== undefined);
  const value = scoreToTenthB(mine);
  const where = value ? placement(cells, value) : null;
  const fmt = (v: number | null) => (v === null ? "" : damage(lang, v));
  const pctText = (x: number) => (x >= 1 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, "");

  return (
    <Card>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 1 }}>
          {serverName(lang, p.server)} · {t.distTitle}
        </Typography>
        <Box sx={{ mx: -1 }}>
          <LineChart
            height={300}
            margin={{ left: 8, right: 16 }}
            // evenly spaced ranks (0.5% … 10%) read better than a log axis here
            xAxis={[{ data: pcts, scaleType: "point", label: t.topPct, valueFormatter: (v: number) => `${v}%` }]}
            yAxis={[{ valueFormatter: (v: number) => axisDamage(lang, v), width: 48 }]}
            series={[
              ...(hasBand ? [
                { id: "hi", data: cells.map((c) => c.hi ?? null), label: `${rangeLabel(t, p.band.level)} ↑`,
                  showMark: false, color: theme.palette.primary.light, valueFormatter: fmt },
                { id: "lo", data: cells.map((c) => c.lo ?? null), label: `${rangeLabel(t, p.band.level)} ↓`,
                  showMark: false, color: theme.palette.primary.light, valueFormatter: fmt },
              ] : []),
              { id: "value", data: cells.map((c) => c.value), label: t.damage,
                color: theme.palette.primary.main, valueFormatter: fmt },
            ]}
            hideLegend
            sx={{ '& path[data-series="lo"], & path[data-series="hi"]': { strokeDasharray: "5 4", strokeWidth: 1.5 } }}
          >
            {value && <ChartsReferenceLine y={value} lineStyle={{ stroke: theme.palette.warning.main, strokeDasharray: "2 3" }} />}
            <ChartsReferenceLine x={3} lineStyle={{ stroke: theme.palette.divider }} />
          </LineChart>
        </Box>

        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography variant="subtitle2">{t.calcTitle}</Typography>
          <TextField
            size="small"
            value={mine}
            onChange={(e) => setMine(groupDigits(e.target.value))}
            placeholder={t.calcPlaceholder}
            slotProps={{ htmlInput: { inputMode: "numeric" },
                         input: { endAdornment: value ? (
                           <InputAdornment position="end">{damage(lang, value)}</InputAdornment>) : null } }}
          />
          {where && (
            <Box>
              <Chip color="warning" variant="outlined" label={
                where.kind === "at" ? t.calcResult(pctText(where.percentile))
                  : where.kind === "above" ? t.calcAbove(pctText(where.percentile))
                    : t.calcBelow(pctText(where.percentile))} />
            </Box>
          )}
        </Stack>

        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>{t.tier}</TableCell>
              <TableCell align="right">{t.damage}</TableCell>
              {hasBand && <TableCell align="right">{rangeLabel(t, p.band.level)}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {cells.map((c) => (
              <TableRow key={c.percentile} selected={c.percentile === 3}>
                <TableCell>{c.percentile}%</TableCell>
                <TableCell align="right" sx={{ fontWeight: c.percentile === 3 ? 700 : 400 }}>
                  {c.extrapolated ? "~" : ""}{damage(lang, c.value)}
                </TableCell>
                {hasBand && (
                  <TableCell align="right" sx={{ color: "text.secondary" }}>
                    {damage(lang, c.lo!)} – {damage(lang, c.hi!)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {cells.some((c) => c.extrapolated) && (
          <Typography variant="caption" color="text.secondary">{t.estimated}</Typography>
        )}
      </CardContent>
    </Card>
  );
}
