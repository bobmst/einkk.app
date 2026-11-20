// @vitest-environment jsdom
// #123: before the raid starts, the season card says it has not started, so the forecast under it
// must not say "Raid day 1 of 5". The real dashboard renders the preview's fixtures (the
// state preview's own, src/preview/states.ts) with /api/* answered in the page.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Providers from "./providers";
import Dashboard from "./dashboard";
import { installFakeApi } from "@/preview/fake-api";
import { stateById } from "@/preview/states";
import { LANGS, langStore, serverStore, text, type Lang } from "@/lib/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const realFetch = window.fetch;

async function show(id: string, lang: Lang) {
  const state = stateById(id);
  if (!state) throw new Error(`no preview state ${id}`);
  installFakeApi(state.build(Date.now()), "ok");
  langStore.set(lang);
  serverStore.set("gb");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Providers><Dashboard /></Providers>); });
  // the page fetches /api/now.json, then the forecast; wait for the forecast's own title
  const title = text(lang).forecastTitle;
  for (let i = 0; i < 60 && !host.textContent?.includes(title); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  }
  return host.textContent ?? "";
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.fetch = realFetch;
});

describe.each(LANGS)("forecast label, %s", (lang) => {
  const t = text(lang);

  it("says it is before the raid while the season has not started, and names no raid day", async () => {
    const page = await show("upcoming-dated", lang);
    expect(page).toContain(t.states.upcoming);           // the season card
    expect(page).toContain(t.forecastTitle);             // the forecast is there
    expect(page).toContain(t.beforeRaid);
    for (let d = 1; d <= 5; d++) expect(page).not.toContain(t.raidDay(d));
  });

  it("names the raid day once the raid is live", async () => {
    const page = await show("live-day1", lang);
    expect(page).toContain(t.states.live);
    expect(page).toContain(t.raidDay(1));
    expect(page).not.toContain(t.beforeRaid);
  });
});
