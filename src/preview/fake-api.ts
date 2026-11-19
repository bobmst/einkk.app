// The Worker's read API and intake, answered from a fixture in the browser (src/preview/states.ts),
// so the real page renders a chosen state with no Worker, outbox or credentials. Installed by
// the preview view page only, before the dashboard mounts.
import type { Fixture } from "./states";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const never = () => new Promise<Response>(() => {});      // a request that never answers

/**
 * Replace window.fetch for /api/* with the fixture's answers. `post` is what a report or a
 * final result gets back: "ok" (201) or one of the Worker's error codes.
 */
export function installFakeApi(fixture: Fixture, post: string) {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return real(input, init);
    const path = url.pathname;
    if ((init?.method ?? "GET") === "POST") {
      if (path === "/api/checks") return new Response(null, { status: 204 });
      await new Promise((r) => setTimeout(r, 600));        // long enough to see "Sending…"
      return post === "ok" ? json({ id: "preview" }, 201) : json({ error: post }, post === "rate_limited" ? 429 : 400);
    }
    if (path === "/api/health") return json(fixture.health);
    if (path === "/api/now.json") {
      if (fixture.now === "hang") return never();
      if (fixture.now === "fail") return json({ error: "unavailable" }, 503);
      if (fixture.now === "missing") return json({ error: "not_found" }, 404);
      return json(fixture.now);
    }
    if (path.startsWith("/api/outbox/")) {
      if (fixture.now === "hang") return never();
      if (fixture.now === "fail") return json({ error: "unavailable" }, 503);
      const key = path.slice("/api/outbox/".length);
      if (key === "history.json") return fixture.history ? json(fixture.history) : json({ error: "not_found" }, 404);
      const doc = fixture.outbox?.[key];
      return doc !== undefined ? json(doc) : json({ error: "not_found" }, 404);
    }
    return json({ error: "not_found" }, 404);
  };
}
