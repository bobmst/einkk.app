"use client";
// One server's forecast: the 3% line with its nested ranges, the damage-by-rank
// curve shaded the same way, and where the player's own damage lands on it.
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
import { alpha, useColorScheme, useTheme } from "@mui/material/styles";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { useDrawingArea, useXScale, useYScale } from "@mui/x-charts/hooks";
import { LineChart, lineClasses } from "@mui/x-charts/LineChart";
import { damage, duration, serverName, type Lang, type Text } from "@/lib/i18n";
import { axisDamage, groupDigits, placement, scoreToTenthB } from "@/lib/numbers";
import type { Prediction } from "@/lib/outbox";

type Band = { level: number; lo: number; hi: number };

/** The prediction's bands, narrowest first; a pre-0.2 document has just the one. */
function bandsOf(p: Prediction): Band[] {
  if (p.bands?.length) return p.bands;
  return [{ level: p.band.level ?? 0.9, lo: p.band.lo, hi: p.band.hi }];
}

const pctLabel = (level: number) => `${Math.round(level * 1000) / 10}%`;
/** Band i's fill, narrowest (0) darkest. Dark mode needs much more opacity for
 *  the steps to stay apart on a near-black card. */
function useShade() {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const steps = dark ? [0.9, 0.55, 0.28, 0.15] : [0.5, 0.3, 0.16, 0.1];
  return (i: number) => alpha(theme.palette.primary.main, steps[i] ?? steps[steps.length - 1]);
}

function rangeLabel(t: Text, level: number | null) {
  return level === null ? t.rangeUncertified : t.range(Math.round(level * 1000) / 10);
}

/** The nested ranges as one bar: darker = narrower = more likely, the forecast
 *  as a line, the widest range's ends written under it. */
function RangeBar({ p, lang, t }: { p: Prediction; lang: Lang; t: Text }) {
  const shade = useShade();
  const bands = bandsOf(p);
  const widest = bands[bands.length - 1];
  const pad = (widest.hi - widest.lo) * 0.25 || 1;
  const min = widest.lo - pad;
  const span = widest.hi + pad - min;
  const at = (v: number) => ((v - min) / span) * 100;
  return (
    <Box sx={{ my: 1.5 }}>
      <Box sx={{ position: "relative", height: 18, borderRadius: 1, bgcolor: "action.hover" }}>
        {bands.map((b, i) => ({ b, i })).reverse().map(({ b, i }) => (
          <Box key={b.level} sx={{
            position: "absolute", top: 0, bottom: 0, left: `${at(b.lo)}%`, width: `${at(b.hi) - at(b.lo)}%`,
            bgcolor: shade(i), borderRadius: 1,
          }} />
        ))}
        <Box sx={{ position: "absolute", top: -4, bottom: -4, left: `${at(p.prediction)}%`, width: 3, ml: "-1.5px",
                   borderRadius: 1, bgcolor: "text.primary" }} />
      </Box>
      <Box sx={{ position: "relative", height: 18, mt: 0.5 }}>
        {[widest.lo, widest.hi].map((v, i) => (
          <Typography key={i} variant="caption" color="text.secondary" sx={{
            position: "absolute", left: `${at(v)}%`, transform: "translateX(-50%)", whiteSpace: "nowrap",
          }}>{damage(lang, v)}</Typography>
        ))}
      </Box>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mt: 0.5 }}>
        {bands.map((b, i) => (
          <Stack key={b.level} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: shade(i) }} />
            <Typography variant="caption">{pctLabel(b.level)}: {damage(lang, b.lo)} – {damage(lang, b.hi)}</Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: "text.primary" }} />
          <Typography variant="caption">{t.forecastLine}</Typography>
        </Stack>
      </Stack>
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
        <RangeBar p={p} lang={lang} t={t} />
        <Typography variant="caption" color="text.secondary">
          {t.raidDay(p.state.raid_day)} · {t.updated(duration(lang, now - Date.parse(p.issued_at)))}
        </Typography>
      </CardContent>
    </Card>
  );
}

/** The player's own damage on the curve: a dot, with short dashed drops to
 *  both axes instead of lines across the whole chart. */
function YouMarker({ pct, value, label, color }: { pct: number; value: number; label: string; color: string }) {
  const x = useXScale<"log">();
  const y = useYScale<"linear">();
  const area = useDrawingArea();
  const cx = x(pct);
  const cy = y(value);
  if (cx === undefined || cy === undefined || Number.isNaN(cx) || Number.isNaN(cy)) return null;
  const bottom = area.top + area.height;
  return (
    <g pointerEvents="none">
      <line x1={cx} x2={cx} y1={cy} y2={bottom} stroke={color} strokeDasharray="3 3" />
      <line x1={area.left} x2={cx} y1={cy} y2={cy} stroke={color} strokeDasharray="3 3" />
      <circle cx={cx} cy={cy} r={5.5} fill={color} stroke="white" strokeWidth={1.5} />
      <text x={cx + 9} y={cy - 9} fill={color} fontSize={12} fontWeight={700}>{label}</text>
    </g>
  );
}

export function Distribution({ p, lang, t }: { p: Prediction; lang: Lang; t: Text }) {
  const theme = useTheme();
  const shade = useShade();
  const [mine, setMine] = useState("");
  const cells = [...(p.cells ?? [])].sort((a, b) => a.percentile - b.percentile);
  if (cells.length < 2) return null;

  const pcts = cells.map((c) => c.percentile);
  const bands = bandsOf(p);                                   // narrowest first
  const widest = bands[bands.length - 1];
  const at = (b: Band, side: "lo" | "hi") => cells.map((c) => (c.value * b[side]) / p.prediction);
  const fmt = (v: number | null) => (v === null ? "" : damage(lang, v));
  const hidden = () => null;                                  // kept out of the tooltip
  const value = scoreToTenthB(mine);
  const where = value ? placement(cells, value) : null;
  const pctText = (x: number) => (x >= 1 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, "");

  // Tooltip rows, top to bottom: widest ↑ … narrowest ↑, the forecast, narrowest ↓ … widest ↓.
  const tips = [
    ...[...bands].reverse().map((b) => ({ id: `tip-hi-${b.level}`, data: at(b, "hi"), label: `${pctLabel(b.level)} ↑` })),
    { id: "mid", data: cells.map((c) => c.value), label: t.forecastLine },
    ...bands.map((b) => ({ id: `tip-lo-${b.level}`, data: at(b, "lo"), label: `${pctLabel(b.level)} ↓` })),
  ].map((s) => ({ ...s, showMark: false, valueFormatter: fmt,
                  color: s.id === "mid" ? theme.palette.primary.main : alpha(theme.palette.primary.main, 0.6) }));

  // Shading: stacked areas from the widest low edge up to the widest high edge,
  // each slice coloured by the band it belongs to.
  const edges: { data: number[]; band: number }[] = [];
  for (let i = bands.length - 1; i >= 1; i--) edges.push({ data: at(bands[i - 1], "lo"), band: i });
  edges.push({ data: at(bands[0], "hi"), band: 0 });
  for (let i = 1; i < bands.length; i++) edges.push({ data: at(bands[i], "hi"), band: i });
  const base = at(widest, "lo");
  const slices = edges.map((e, i) => ({
    id: `band-${i}`,
    data: e.data.map((v, k) => v - (i === 0 ? base : edges[i - 1].data)[k]),
    color: shade(e.band),
  }));
  const shading = [{ id: "band-base", data: base, color: "transparent" }, ...slices]
    .map((s) => ({ ...s, stack: "bands", area: true, showMark: false, valueFormatter: hidden }));
  // the transparent base would pull the axis down to 0: frame the curve instead
  const shown = [...base, ...at(widest, "hi"), ...(value ? [value] : [])];
  const yMin = Math.min(...shown) * 0.92;
  const yMax = Math.max(...shown) * 1.04;

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
            xAxis={[{ data: pcts, scaleType: "log", label: t.topPct, tickInterval: pcts,
                      valueFormatter: (v: number) => `${v}%` }]}
            yAxis={[{ min: yMin, max: yMax, valueFormatter: (v: number) => axisDamage(lang, v), width: 48 }]}
            series={[...tips, ...shading]}
            hideLegend
            sx={{
              [`& .${lineClasses.line}[data-series^="band-"]`]: { display: "none" },
              [`& .${lineClasses.line}[data-series^="tip-"]`]: { strokeWidth: 1, strokeOpacity: 0.7 },
              [`& .${lineClasses.mark}[data-series-id^="band-"], & .${lineClasses.highlight}[data-series-id^="band-"]`]: { display: "none" },
            }}
          >
            <ChartsReferenceLine x={3} lineStyle={{ stroke: theme.palette.divider }} />
            {where && value && (
              <YouMarker pct={where.percentile} value={value} label={t.you} color={theme.palette.warning.main} />
            )}
          </LineChart>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t.bandsLegend(bands.map((b) => pctLabel(b.level)).join(" / "))}
        </Typography>

        <Stack spacing={1} sx={{ mt: 2 }}>
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
              <TableCell align="right">{rangeLabel(t, widest.level)}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {cells.map((c, k) => (
              <TableRow key={c.percentile} selected={c.percentile === 3}>
                <TableCell>{c.percentile}%</TableCell>
                <TableCell align="right" sx={{ fontWeight: c.percentile === 3 ? 700 : 400 }}>
                  {c.extrapolated ? "~" : ""}{damage(lang, c.value)}
                </TableCell>
                <TableCell align="right" sx={{ color: "text.secondary" }}>
                  {damage(lang, at(widest, "lo")[k])} – {damage(lang, at(widest, "hi")[k])}
                </TableCell>
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
