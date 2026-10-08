"use client";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { duration, elementName, when, type Lang, type Text } from "@/lib/i18n";
import type { Element, Season } from "@/lib/outbox";

export const ELEMENT_COLORS: Record<Element, string> = {
  fire: "#e5484d", water: "#3e8cf0", wind: "#30a46c", iron: "#d99a0b", electronic: "#a35ee8",
};

export default function SeasonCard({ season, lang, t, now }: {
  season: Season; lang: Lang; t: Text; now: number;
}) {
  const [art, setArt] = useState(true);              // public/bosses/s<n>.webp, if copied
  const color = ELEMENT_COLORS[season.boss.element];
  const weakness = season.boss.weakness;
  const ends = Date.parse(season.ends_at) + 60_000;   // ends_at is the last minute
  const starts = Date.parse(season.starts_at);
  const survey = season.survey;
  const surveyOpen = survey && now >= Date.parse(survey.opens_at) && now <= Date.parse(survey.closes_at);

  return (
    <Card sx={{ overflow: "hidden" }}>
      <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" } }}>
        <Box
          sx={{
            width: { xs: "100%", sm: 240 },
            minHeight: { xs: 200, sm: 240 },
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `radial-gradient(circle at 50% 45%, ${color}66 0%, ${color}22 45%, transparent 75%)`,
          }}
        >
          {art && (
            <Box
              component="img"
              src={`/bosses/s${season.season}.webp`}
              alt={season.boss.name}
              onError={() => setArt(false)}
              sx={{ maxWidth: "92%", maxHeight: { xs: 200, sm: 240 }, objectFit: "contain" }}
            />
          )}
        </Box>
        <Stack spacing={1.25} sx={{ p: 2.5, flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              {t.season(season.season)}
            </Typography>
            <Chip
              size="small"
              label={t.states[season.state]}
              color={season.state === "live" ? "success" : "default"}
              variant={season.state === "live" ? "filled" : "outlined"}
            />
          </Stack>
          <Typography variant="h1" component="h2">{season.boss.name}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Chip size="small" label={elementName(lang, season.boss.element)}
                  sx={{ bgcolor: color, color: "#fff", fontWeight: 600 }} />
            {weakness && (
              <Chip size="small" variant="outlined"
                    label={`${t.weakness} ${elementName(lang, weakness)}`}
                    sx={{ borderColor: ELEMENT_COLORS[weakness], color: ELEMENT_COLORS[weakness] }} />
            )}
          </Stack>
          {season.state === "live" && (
            <Typography variant="h2" component="p">{t.endsIn(duration(lang, ends - now))}</Typography>
          )}
          {season.state === "upcoming" && (
            <Typography variant="h2" component="p">{t.startsIn(duration(lang, starts - now))}</Typography>
          )}
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t.starts} {when(lang, season.starts_at)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t.ends} {when(lang, season.ends_at)}
            </Typography>
            <Typography variant="caption" color="text.secondary">{t.timeNote}</Typography>
          </Box>
          {surveyOpen && (
            <Box>
              <Button variant="outlined" size="small" href={survey.url} target="_blank" rel="noopener">
                {t.survey}
              </Button>
            </Box>
          )}
        </Stack>
      </Box>
    </Card>
  );
}
