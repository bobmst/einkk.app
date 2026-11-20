// The link-preview card (#120): src/app/opengraph-image.png and its alt text become og:image,
// its size and alt, and twitter:image on every page (Next's file convention). The PNG is the
// large-card size the crawlers expect, small enough for them, and the origin it hangs off is
// uat's on uat's build only.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_ORIGIN, UAT_ORIGIN, siteOrigin } from "../src/lib/site";

const dir = join(__dirname, "..", "src", "app");
const png = join(dir, "opengraph-image.png");

describe("share preview image", () => {
  it("is a 1200x630 PNG under X's 5 MB limit", () => {
    const head = readFileSync(png).subarray(0, 24);
    expect(head.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(head.readUInt32BE(16)).toBe(1200);       // IHDR width
    expect(head.readUInt32BE(20)).toBe(630);        // IHDR height
    expect(statSync(png).size).toBeLessThan(5 * 1024 * 1024);
  });

  it("has alt text that fits a meta tag", () => {
    const alt = readFileSync(join(dir, "opengraph-image.alt.txt"), "utf8");
    expect(alt.length).toBeGreaterThan(20);
    expect(alt).toBe(alt.trim());                   // a trailing newline would end up in the tag
    expect(alt).not.toMatch(/\d/);                  // the image is static: no number to go stale
  });
});

describe("siteOrigin", () => {
  it("is einkk.app, and uat.einkk.app on the build made with STATE_PREVIEW=1", () => {
    expect(siteOrigin({})).toBe(PRODUCTION_ORIGIN);
    expect(siteOrigin({ STATE_PREVIEW: "0" })).toBe(PRODUCTION_ORIGIN);
    expect(siteOrigin({ STATE_PREVIEW: "1" })).toBe(UAT_ORIGIN);
  });
});
