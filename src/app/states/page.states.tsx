"use client";
// The text-review index (#112): every state of the page (src/preview/states.ts) x language x
// light/dark, each a link to its preview, with the keys the state shows and the owner's marks.
// A page only in the STATE_PREVIEW build (next.config.ts: local and uat), never in production.
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { LANGS, LANG_NAMES } from "@/lib/i18n";
import { ORDER, THEMES, cellKey, readMarks, viewHref, type Mark } from "@/preview/review";
import { STATES } from "@/preview/states";

const ERRORS = ["invalid_report", "turnstile_failed", "rate_limited", "closed", "intake_not_configured", "other"];

export default function StatesIndex() {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage, read after hydration
  useEffect(() => setMarks(readMarks()), []);
  const done = Object.keys(marks).length;
  const first = ORDER.find((c) => !marks[cellKey(c)]);
  const changes = ORDER.filter((c) => marks[cellKey(c)] === "change").map(cellKey);
  const groups = [...new Set(STATES.map((s) => s.group))];

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h1" sx={{ mb: 1 }}>Text review: every state of the page</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Each link opens the real page in one state, language and theme, from made-up documents
        (src/preview/states.ts). The bar at the bottom right walks every page in order (language by
        language) and marks each one OK or Change; marks stay in this browser. docs/text-review/states.md
        says why each state shows what it does.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="body2">{done} of {ORDER.length} marked, {changes.length} to change.</Typography>
        {first && <Button variant="contained" size="small" href={viewHref(first)}>
          {done ? "Continue" : "Start"}: {first.state} · {first.lang} · {first.theme}
        </Button>}
        {changes.length > 0 && (
          <Button size="small" variant="outlined" onClick={() => navigator.clipboard?.writeText(changes.join("\n"))}>
            Copy the pages marked Change
          </Button>
        )}
      </Stack>

      {groups.map((group) => (
        <Box key={group} sx={{ mb: 3 }}>
          <Typography variant="h2" sx={{ mb: 1 }}>{group}</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>State</TableCell>
                {LANGS.map((l) => <TableCell key={l} align="center">{LANG_NAMES[l]}</TableCell>)}
                <TableCell>Keys shown (besides the header and footer)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {STATES.filter((s) => s.group === group).map((s) => (
                <TableRow key={s.id}>
                  <TableCell sx={{ minWidth: 200 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.id}</Typography>
                    <Typography variant="note">{s.title} · server {s.server.toUpperCase()}</Typography>
                  </TableCell>
                  {LANGS.map((lang) => (
                    <TableCell key={lang} align="center" sx={{ whiteSpace: "nowrap" }}>
                      {THEMES.map((theme) => {
                        const cell = { state: s.id, lang, theme };
                        const mark = marks[cellKey(cell)];
                        return (
                          <Link key={theme} href={viewHref(cell)} sx={{ mx: 0.5, fontWeight: mark ? 700 : 400,
                            color: mark === "ok" ? "success.main" : mark === "change" ? "error.main" : undefined }}>
                            {theme}{mark === "ok" ? " ✓" : mark === "change" ? " ✗" : ""}
                          </Link>
                        );
                      })}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Typography variant="note" component="p" sx={{ fontFamily: "monospace", wordBreak: "break-word" }}>
                      {s.keys.length ? [...new Set(s.keys)].join(", ") : "—"}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ))}

      <Typography variant="h2" sx={{ mb: 1 }}>Report errors</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        The fake API takes every report. These open live-day1 with Submit answered by one error
        (fill the form, Next, then Submit), in English; change lang= in the address for the others.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {ERRORS.map((code) => (
          <Button key={code} size="small" variant="outlined"
                  href={viewHref({ state: "live-day1", lang: "en", theme: "light" }, `&post=${code}`)}>{code}</Button>
        ))}
      </Stack>
    </Container>
  );
}
