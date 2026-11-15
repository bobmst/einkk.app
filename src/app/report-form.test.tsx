// #96: one current server on the page. The report form shows the page's server and picking one
// in the form switches the page; the page's server is serverStore, which the tabs set too.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import ReportForm, { ServerSelect } from "./report-form";
import { serverName, serverStore, text } from "@/lib/i18n";
import type { Server } from "@/lib/outbox";

const t = text("en");
const health = { ok: true, intake: true, turnstile_site_key: "site-key" };

// the select's shown value: MUI renders the chosen item's label in the closed select
function shown(html: string): string | null {
  return /role="combobox"[^>]*>([^<]*)</.exec(html)?.[1] ?? null;
}

function form(server: Server, final = false) {
  return renderToStaticMarkup(
    <ReportForm season={{ season: 43, state: "live" }} health={health} server={server}
                onServer={() => {}} lang="en" t={t} final={final} predictions={{}} />);
}

describe("the report form and the page share one server", () => {
  it("shows the page's server, for whichever server the tabs are on", () => {
    expect(shown(form("na"))).toBe(serverName("en", "na"));
    expect(shown(form("gb"))).toBe(serverName("en", "gb"));
  });

  it("does the same in the final-results form", () => {
    expect(shown(form("kr", true))).toBe(serverName("en", "kr"));
    expect(shown(form("tw", true))).toBe(serverName("en", "tw"));
  });

  it("hands a server picked in the form to the page instead of keeping it", () => {
    const onServer = vi.fn();
    const field = ServerSelect({ server: "gb", onServer, lang: "en", label: t.server }) as ReactElement<{
      value: Server; onChange: (e: { target: { value: string } }) => void }>;
    expect(field.props.value).toBe("gb");
    field.props.onChange({ target: { value: "na" } });
    expect(onServer).toHaveBeenCalledWith("na");
  });

  it("moves the page's server, which the tabs read, when the form picks one", () => {
    const heard = vi.fn();
    const stop = serverStore.subscribe(heard);
    const field = ServerSelect({ server: "gb", onServer: serverStore.set, lang: "en", label: t.server }) as
      ReactElement<{ onChange: (e: { target: { value: string } }) => void }>;
    field.props.onChange({ target: { value: "na" } });
    expect(serverStore.get()).toBe("na");
    expect(heard).toHaveBeenCalled();
    stop();
  });
});
