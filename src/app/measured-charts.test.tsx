// @vitest-environment jsdom
// #93 again, for the two charts it missed: the track record's bars and the final results' curve.
// x-charts lays its first pass out at width 0, where its clip areas come out negative, and the
// browser logs "<rect> attribute width: A negative value is not valid". Next 16.4.6 loads the
// chunks in a different order and brought those logs out on the state preview (#121).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import Providers from "./providers";
import TrackRecord from "./track-record";
import FinalsView from "./finals-view";
import { text } from "@/lib/i18n";
import type { Finals, HistoryEntry } from "@/lib/outbox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const history: HistoryEntry[] = [
  { season: 41, server: "gb", forecast: 300, grading: { error_pct: 2.1, hit: true } },
  { season: 42, server: "gb", forecast: 310, grading: { error_pct: -3.4, hit: false } },
];
const finals: Finals = {
  issued_at: "2026-11-01T00:00:00Z", season: 43, settles_at: "2026-11-01T00:00:00Z", settled: true,
  servers: [{
    server: "gb", players: 40, near_3: 5, line: { value: 300, confirmed: true },
    points: [{ rank_pc: 1, damage: 400 }, { rank_pc: 3, damage: 300 }, { rank_pc: 5, damage: 250 }],
    cells: [1, 3, 5].map((percentile, i) => ({ percentile, value: 400 - i * 80 })),
  }],
};

let root: Root | null = null;
let host: HTMLElement | null = null;
// every width a <rect> is given along the way: the bad ones are replaced within the same commit
// once the chart has measured itself, so only the attribute writes show them
const given: number[] = [];
function draw(node: ReactNode) {
  const set = Element.prototype.setAttribute;
  vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (this: Element, name: string, value: string) {
    if (this.tagName.toLowerCase() === "rect" && name === "width") given.push(Number(value));
    return set.call(this, name, value);
  });
  given.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Providers>{node}</Providers>));
  return host;
}
const widths = (el: HTMLElement) => [...el.querySelectorAll("svg rect")].map((r) => Number(r.getAttribute("width")));
const unmeasured = () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 0, height: 0 } as DOMRect);
};
const measured = () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 300 } as DOMRect);
};

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

const t = text("en");
const track = <TrackRecord entries={history} server="gb" lang="en" t={t} current={43} />;
const curve = <FinalsView finals={finals} server="gb" lang="en" t={t} now={0} />;

describe.each([["track record", track], ["final results curve", curve]])("%s chart", (_name, node) => {
  it("draws no negative-width clip area before the container is measured", () => {
    unmeasured();
    const el = draw(node);
    expect(widths(el)).toEqual([]);
    expect(given.filter((w) => w < 0)).toEqual([]);
  });

  it("draws the chart at the container's width once it has one", () => {
    measured();
    const el = draw(node);
    expect(widths(el).length).toBeGreaterThan(0);
    expect(given.filter((w) => w < 0)).toEqual([]);
  });
});
