// @vitest-environment jsdom
// #93: the distribution chart's first layout pass, before its container has a width, drew clip
// areas of negative width (the browser logged "<rect> attribute width: A negative value is not valid").
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Providers from "./providers";
import { Distribution } from "./server-view";
import { text } from "@/lib/i18n";
import type { Prediction } from "@/lib/outbox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const band = (level: number, lo: number, hi: number) => ({ level, lo, hi, method: "conformal_walk_forward" });
const p = {
  season: 43, server: "jp", prediction: 300, state: { known_days: 4, raid_day: 4 },
  band: band(0.9, 280, 320), bands: [band(0.5, 290, 310), band(0.9, 280, 320)],
  cells: [0.5, 0.7, 1, 2, 3, 5, 10].map((percentile, i) => ({ percentile, value: 400 - i * 30, lo: 1, hi: 2 })),
  residuals: [{ season: 42, error_pct: 2 }, { season: 41, error_pct: -3 }, { season: 40, error_pct: 1 }],
} as unknown as Prediction;

let root: Root | null = null;
let host: HTMLElement | null = null;
// every width a <rect> is given along the way, since the bad ones are replaced within the same
// commit once the chart has measured itself
const given: number[] = [];
function draw() {
  const set = Element.prototype.setAttribute;
  vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (this: Element, name: string, value: string) {
    if (this.tagName.toLowerCase() === "rect" && name === "width") given.push(Number(value));
    return set.call(this, name, value);
  });
  given.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Providers><Distribution p={p} lang="en" t={text("en")} /></Providers>));
  return host;
}
const widths = (el: HTMLElement) => [...el.querySelectorAll("svg rect")].map((r) => Number(r.getAttribute("width")));

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("Distribution chart", () => {
  it("draws no negative-width clip area before the container is measured", () => {
    // a browser's first pass: the box (a parent with no width yet, plus the 8px negative margins) reads 16px
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) =>
      new Proxy(real(el, pseudo), {
        get: (style, key) => key === "width" ? "16px" : key === "height" ? "300px" : style[key as keyof CSSStyleDeclaration],
      }));
    draw();
    expect(given.filter((w) => w < 0)).toEqual([]);
  });

  it("draws the chart at the container's width once it has one", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 300 } as DOMRect);
    const el = draw();
    expect(widths(el).length).toBeGreaterThan(0);
    expect(given.filter((w) => w < 0)).toEqual([]);
  });
});
