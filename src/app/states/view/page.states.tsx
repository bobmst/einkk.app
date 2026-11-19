"use client";
// One state of the page from its fixture (src/preview/states.ts), in one language and theme:
// /states/view?s=<state>&lang=<lang>&theme=light|dark[&post=<error code>]. The real dashboard
// renders it; only /api/* is answered by src/preview/fake-api.ts. A page only in the
// STATE_PREVIEW build (next.config.ts: local and uat), never in production.
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useColorScheme } from "@mui/material/styles";
import { LANGS, langStore, serverStore, type Lang } from "@/lib/i18n";
import { lastReport } from "@/lib/last-report";
import { saveSnapshot } from "@/lib/snapshot";
import { installFakeApi } from "@/preview/fake-api";
import { ORDER, THEMES, cellKey, readMarks, setMark, viewHref, type Cell, type Mark, type Theme } from "@/preview/review";
import { stateById, type PreviewState } from "@/preview/states";
import { isolateStorage } from "@/preview/storage";
import Dashboard from "../../dashboard";

// before the page or its providers read anything: a fixture never reaches the site's own storage
isolateStorage();

function Bar({ cell, state }: { cell: Cell; state: PreviewState }) {
  const [open, setOpen] = useState(true);
  const [mark, setLocal] = useState<Mark | null>(() => readMarks()[cellKey(cell)] ?? null);
  const at = ORDER.findIndex((c) => cellKey(c) === cellKey(cell));
  const prev = at > 0 ? ORDER[at - 1] : null;
  const next = at >= 0 && at < ORDER.length - 1 ? ORDER[at + 1] : null;
  const choose = (m: Mark) => {
    const value = mark === m ? null : m;
    setMark(cell, value);
    setLocal(value);
  };
  if (!open) {
    return (
      <Button size="small" variant="contained" onClick={() => setOpen(true)}
              sx={{ position: "fixed", right: 8, bottom: 8, zIndex: 2000, minWidth: 0 }}>review</Button>
    );
  }
  return (
    <Paper elevation={6} sx={{ position: "fixed", right: 8, bottom: 8, zIndex: 2000, p: 1.25, maxWidth: 360,
                               border: 2, borderColor: "warning.main" }}>
      <Typography variant="caption" component="p" sx={{ fontWeight: 700 }}>
        Preview {at + 1}/{ORDER.length}: {state.id} · {cell.lang} · {cell.theme}
      </Typography>
      <Typography variant="caption" component="p" sx={{ mb: 1 }}>{state.title}</Typography>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button size="small" href="/states">Index</Button>
        <Button size="small" disabled={!prev} href={prev ? viewHref(prev) : undefined}>Prev</Button>
        <Button size="small" disabled={!next} href={next ? viewHref(next) : undefined}>Next</Button>
        <Button size="small" variant={mark === "ok" ? "contained" : "outlined"} color="success"
                onClick={() => choose("ok")}>OK</Button>
        <Button size="small" variant={mark === "change" ? "contained" : "outlined"} color="error"
                onClick={() => choose("change")}>Change</Button>
        <Button size="small" onClick={() => setOpen(false)}>Hide</Button>
      </Stack>
    </Paper>
  );
}

export default function StateView() {
  const { setMode } = useColorScheme();
  const [shown, setShown] = useState<{ cell: Cell; state: PreviewState } | "missing" | null>(null);
  const once = useRef(false);

  // Everything the page reads at its first render is set before it mounts: the language,
  // the followed server, the saved snapshot and remembered report (all in this tab's in-memory
  // storage), and the fake API.
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const q = new URLSearchParams(window.location.search);
    const state = stateById(q.get("s") ?? "");
    const lang = (LANGS as readonly string[]).includes(q.get("lang") ?? "") ? q.get("lang") as Lang : "en";
    const theme: Theme = (THEMES as readonly string[]).includes(q.get("theme") ?? "") ? q.get("theme") as Theme : "light";
    if (!state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL on open
      setShown("missing");
      return;
    }
    const fixture = state.build(Date.now());
    try {
      localStorage.removeItem("snapshot.v1");
      localStorage.removeItem("einkk.last-report");
    } catch {}
    if (fixture.snapshot) saveSnapshot(fixture.snapshot.data, Date.now() - fixture.snapshot.ageMs);
    if (fixture.lastReport) lastReport.set(fixture.lastReport.season, fixture.lastReport.server, fixture.lastReport.score);
    langStore.set(lang);
    serverStore.set(state.server);
    setMode(theme);
    installFakeApi(fixture, q.get("post") ?? "ok");
    // the dashboard reads ?frame= / ?at= from the address itself
    if (fixture.search && !q.has(fixture.search.split("=")[0])) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}&${fixture.search}`);
    }
    setShown({ cell: { state: state.id, lang, theme }, state });
  }, [setMode]);

  if (shown === null) return null;
  if (shown === "missing") {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>No such state.</Typography>
        <Button href="/states">Back to the index</Button>
      </Box>
    );
  }
  return (
    <>
      <Dashboard />
      <Bar cell={shown.cell} state={shown.state} />
    </>
  );
}
