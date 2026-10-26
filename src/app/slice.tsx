"use client";
// A slice through the damage-by-rank chart at one tier: where that tier's final
// line may land (a curve from the forecast's past misses both ways round, the forecast
// and the 9-in-10 range marked), and, with the player's score entered, the
// chance it makes that tier (or, when the rank shown in game already puts it past
// that tier, that only a higher score gets in).
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useColorScheme, useTheme } from "@mui/material/styles";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { LineChart } from "@mui/x-charts/LineChart";
import { damage, type Lang, type Text } from "@/lib/i18n";
import type { Cell, Prediction } from "@/lib/outbox";
import { cdf, chanceText, density, quantile, ratios } from "@/lib/slice";

export default function Slice({ p, cells, score, tier, closed = false, onTier, lang, t }: {
  p: Prediction; cells: Cell[]; score: number | null; tier: number; closed?: boolean;
  onTier: (tier: number) => void; lang: Lang; t: Text;
}) {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const dark = (mode === "system" ? systemMode : mode) === "dark";
  const range = { stroke: (theme.vars ?? theme).palette.text.secondary, strokeDasharray: "4 3",
                  strokeOpacity: dark ? 0.75 : 1, shapeRendering: "crispEdges" as const };
  const cell = cells.find((c) => c.percentile === tier) ?? cells[0];
  const xs = ratios(p);
  // the 9-in-10 range comes from the same curve as the chance; the line marks the
  // tier's forecast damage, the same value as the table's damage column
  const lo = cell.value * quantile(xs, 0.05);
  const hi = cell.value * quantile(xs, 0.95);

  const from = quantile(xs, 0.002);
  const to = quantile(xs, 0.998);
  const grid = Array.from({ length: 81 }, (_, i) => from + ((to - from) * i) / 80);
  const ys = density(xs, grid);
  const values = grid.map((r) => cell.value * r);
  const chance = score ? cdf(xs, score / cell.value) : null;    // the line ends at or below the score
  const scoreOnAxis = score && score >= values[0] && score <= values[values.length - 1];
  const warn = theme.palette.warning.main;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ mr: 0.5 }}>{t.sliceTitle(tier)}</Typography>
        {cells.map((c) => (
          <Chip key={c.percentile} size="small" label={`${c.percentile}%`} clickable
                color={c.percentile === tier ? "primary" : "default"}
                variant={c.percentile === tier ? "filled" : "outlined"}
                onClick={() => onTier(c.percentile)} />
        ))}
      </Stack>
      <Box sx={{ mx: -1 }}>
        <LineChart
          height={150}
          margin={{ left: 8, right: 16, top: 8, bottom: 4 }}
          xAxis={[{ data: values, scaleType: "linear", min: values[0], max: values[values.length - 1],
                    valueFormatter: (v: number) => damage(lang, v), tickNumber: 4, tickLabelMinGap: 12 }]}
          yAxis={[{ position: "none", min: 0 }]}
          series={[{ data: ys, area: true, showMark: false, color: alpha(theme.palette.primary.main, 0.35),
                     valueFormatter: () => null }]}
          hideLegend
          slotProps={{ tooltip: { trigger: "none" } }}
        >
          {/* snapped to whole pixels: at fractional positions one dashed line came out
              crisp and the other smeared paler, though both are the same colour */}
          <ChartsReferenceLine x={lo} lineStyle={range} />
          <ChartsReferenceLine x={hi} lineStyle={range} />
          {/* theme.vars follows the colour scheme; theme.palette is the light one.
              Solid white is harsh on the dark card, so the line is softened there. */}
          <ChartsReferenceLine x={cell.value} lineStyle={{ stroke: (theme.vars ?? theme).palette.text.primary,
                                                         strokeOpacity: dark ? 0.65 : 1 }} />
          {scoreOnAxis && (
            <ChartsReferenceLine x={score} label={t.you} labelAlign="start"
                                 lineStyle={{ stroke: warn, strokeWidth: 2 }}
                                 labelStyle={{ fill: warn, fontWeight: 700, fontSize: 12 }} />
          )}
        </LineChart>
      </Box>
      <Typography variant="body2">
        {t.damage} <b>{damage(lang, cell.value)}</b> · {t.likelyRange(damage(lang, lo), damage(lang, hi))}
      </Typography>
      {chance !== null && (
        <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 700, color: "warning.main" }}>
          {closed ? t.closedChance(tier) : t.chance(tier, chanceText(chance))}
        </Typography>
      )}
      {p.state.known_days < 3 && (
        <Typography variant="caption" color="text.secondary" component="p">{t.earlyNote}</Typography>
      )}
    </Box>
  );
}
