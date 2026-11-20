// public/_headers is what Workers static assets send with every page. The CSP in it must let
// the two Cloudflare services the pages use through (Turnstile for the forms, Web Analytics'
// beacon for visit counts, #119) and nothing wider: a blocked beacon logs a CSP error on every
// page view and leaves us with no visitor numbers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const text = readFileSync(join(__dirname, "..", "public", "_headers"), "utf8");
const line = text.split(/\r?\n/).find((l) => l.trim().startsWith("Content-Security-Policy:"));
const csp = new Map(
  (line ?? "").replace(/^\s*Content-Security-Policy:\s*/, "").split(";").map((d) => d.trim()).filter(Boolean)
    .map((d) => { const [name, ...sources] = d.split(/\s+/); return [name, sources] as const; }),
);

describe("Content-Security-Policy in public/_headers", () => {
  it("is set once, for every path", () => {
    expect(text.split(/\r?\n/).filter((l) => l.trim().startsWith("Content-Security-Policy:"))).toHaveLength(1);
    expect(text.split(/\r?\n/).some((l) => l.trim() === "/*")).toBe(true);
  });

  it("lets Cloudflare Web Analytics' beacon load and report", () => {
    expect(csp.get("script-src")).toContain("https://static.cloudflareinsights.com");
    expect(csp.get("connect-src")).toContain("https://cloudflareinsights.com");
    // the automatic injection reports to the site's own /cdn-cgi/rum
    expect(csp.get("connect-src")).toContain("'self'");
  });

  it("still lets Turnstile through", () => {
    expect(csp.get("script-src")).toContain("https://challenges.cloudflare.com");
    expect(csp.get("connect-src")).toContain("https://challenges.cloudflare.com");
    expect(csp.get("frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it("names every outside host in full: no wildcard, no plain http", () => {
    for (const [name, sources] of csp) {
      for (const s of sources.filter((x) => /^[a-z*]+:\/\/|\*/.test(x))) {
        expect(s, `${name}: ${s}`).toMatch(/^https:\/\/[a-z0-9.-]+$/);
      }
    }
  });
});
