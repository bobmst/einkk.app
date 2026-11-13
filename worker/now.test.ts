import { describe, expect, it } from "vitest";
import type { WorkerEnv } from "./env";
import { handleNow, PAGE_FIELDS, SERVERS } from "./now";

const UPLOADED = new Date("2026-11-14T03:00:00Z");
const SEASON = { schema_version: "0.4.0", season: 43, starts_at: "2026-11-13T20:00:00Z",
  ends_at: "2026-11-18T19:59:00Z", state: "live", survey: null };
const LIVE = Date.parse("2026-11-15T00:00:00Z");
const CLOSED = Date.parse("2026-11-18T21:00:00Z");

const prediction = (server: string) => ({
  schema_version: "0.8.0", run_id: "r1", revision: 3, issued_at: "2026-11-15T00:03:00Z", season: 43, server,
  model_version: "2.4.1", code_sha: "abc", state: { raid_day: 2 }, target: "3%", prediction: 200,
  band: { lo: 190, hi: 210, level: 0.9, method: "conformal_walk_forward" }, cells: [], bands: [],
  residuals: [{ season: 42, error_pct: 1.2 }], provisional: false, inputs: { anchors: [] }, dq: { ok: true },
});

function bucket(objects: Record<string, { body: unknown; etag: string }>) {
  const reads: string[] = [];
  const env = {
    OUTBOX: {
      get: async (key: string) => {
        reads.push(key);
        const o = objects[key];
        return o ? { httpEtag: o.etag, uploaded: UPLOADED, text: async () => JSON.stringify(o.body) } : null;
      },
    },
  } as unknown as WorkerEnv;
  return { env, reads };
}

const published = (extra: Record<string, { body: unknown; etag: string }> = {}) => ({
  "season.json": { body: SEASON, etag: '"s1"' },
  ...Object.fromEntries(SERVERS.filter((s) => s !== "sea")
    .map((s) => [`predictions/s43/${s}.json`, { body: prediction(s), etag: `"${s}1"` }])),
  ...extra,
});

const get = (env: WorkerEnv, at: number, init: RequestInit = {}) =>
  handleNow(new Request("https://einkk.example/api/now.json", init), env, undefined, at);

describe("GET /api/now.json", () => {
  it("puts the season and every server's forecast in one response, null where none is published", async () => {
    const { env, reads } = bucket(published());
    const response = await get(env, LIVE);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
    const body = await response.json() as { season: unknown; predictions: Record<string, unknown>; finals?: unknown };
    expect(body.season).toEqual(SEASON);
    expect(Object.keys(body.predictions)).toEqual([...SERVERS]);
    expect(body.predictions.sea).toBeNull();
    expect("finals" in body).toBe(false);                            // before the close: not read at all
    expect(reads).not.toContain("finals/s43.json");
  });

  it("sends only the prediction fields the page reads", async () => {
    const { env } = bucket(published());
    const body = await (await get(env, LIVE)).json() as { predictions: Record<string, Record<string, unknown>> };
    expect(Object.keys(body.predictions.jp).sort()).toEqual(
      PAGE_FIELDS.filter((f) => f in prediction("jp")).sort());
    for (const dropped of ["inputs", "dq", "run_id", "schema_version", "model_version", "code_sha"]) {
      expect(body.predictions.jp).not.toHaveProperty(dropped);
    }
  });

  it("adds the season's finals from the close, null until they are published", async () => {
    const finals = { season: 43, settles_at: "2026-11-19T08:00:00Z", settled: false, servers: [] };
    const without = await (await get(bucket(published()).env, CLOSED)).json() as { finals?: unknown };
    expect(without.finals).toBeNull();
    const withFinals = await (await get(bucket(published({ "finals/s43.json": { body: finals, etag: '"f1"' } })).env,
      CLOSED)).json() as { finals?: unknown };
    expect(withFinals.finals).toEqual(finals);
  });

  it("answers 304 to its own ETag, weak or strong, and a new one once any document changes", async () => {
    const { env } = bucket(published());
    const etag = (await get(env, LIVE)).headers.get("ETag") as string;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const again = await get(env, LIVE, { headers: { "If-None-Match": `W/${etag}` } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect((await get(env, LIVE, { headers: { "If-None-Match": `"other", ${etag}` } })).status).toBe(304);
    const moved = bucket(published({ "predictions/s43/kr.json": { body: prediction("kr"), etag: '"kr2"' } })).env;
    expect((await get(moved, LIVE, { headers: { "If-None-Match": etag } })).status).toBe(200);
    expect((await get(env, CLOSED, { headers: { "If-None-Match": etag } })).status).toBe(200);   // finals now in it
  });

  it("is a 404 without a season, a 502 on an unreadable one, and GET or HEAD only", async () => {
    expect((await get(bucket({}).env, LIVE)).status).toBe(404);
    expect((await get(bucket({ "season.json": { body: { season: "x" }, etag: '"s"' } }).env, LIVE)).status).toBe(502);
    expect((await get(bucket(published()).env, LIVE, { method: "POST" })).status).toBe(405);
    const head = await get(bucket(published()).env, LIVE, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });
});
