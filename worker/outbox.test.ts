import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerEnv } from "./env";
import { handleLatest, handleOutbox, MAX_AGE_SECONDS, STALE_SECONDS } from "./outbox";

const ETAG = '"abc123"';
const SEASON = JSON.stringify({ schema_version: "0.1.0", season: 42 });
const PREDICTION = JSON.stringify({ schema_version: "0.6.0", season: 42, server: "jp", prediction: 300 });
const PREDICTION_ETAG = '"pred42"';

const UPLOADED = new Date("2026-10-30T03:00:00Z");

// R2's get(): null when missing, else the object (the Worker no longer passes onlyIf:
// it judges conditional requests itself, from R2 or from the edge cache).
function bucket(objects: Record<string, { body: string; etag: string }>) {
  const reads: string[] = [];
  const env = {
    OUTBOX: {
      get: async (key: string) => {
        reads.push(key);
        const o = objects[key];
        return o ? { httpEtag: o.etag, uploaded: UPLOADED, text: async () => o.body } : null;
      },
    },
  } as unknown as WorkerEnv;
  return { env, reads };
}

const { env } = bucket({ "season.json": { body: SEASON, etag: ETAG } });

const get = (key: string, init: RequestInit = {}, e = env) =>
  handleOutbox(new Request(`https://einkk.example/api/outbox/${key}`, init), e, key);

describe("GET /api/outbox/<key>", () => {
  it("serves a published document with a short cache and an ETag", async () => {
    const response = await get("season.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe(`public, max-age=${MAX_AGE_SECONDS}`);
    expect(response.headers.get("ETag")).toBe(ETAG);
    expect(await response.text()).toBe(SEASON);
  });

  it("answers 304 when the client already has this version", async () => {
    const response = await get("season.json", { headers: { "If-None-Match": ETAG } });
    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(ETAG);
    expect(await response.text()).toBe("");
  });

  it("matches the weak ETag Cloudflare hands out on compressed responses", async () => {
    expect((await get("season.json", { headers: { "If-None-Match": `W/${ETAG}` } })).status).toBe(304);
    expect((await get("season.json", { headers: { "If-None-Match": `"other", W/${ETAG}` } })).status).toBe(304);
    expect((await get("season.json", { headers: { "If-None-Match": '"other"' } })).status).toBe(200);
  });

  it("answers 304 to If-Modified-Since unless the document is newer", async () => {
    const at = (d: Date) => ({ headers: { "If-Modified-Since": d.toUTCString() } });
    expect((await get("season.json", at(UPLOADED))).status).toBe(304);
    expect((await get("season.json", at(new Date(UPLOADED.getTime() - 60_000)))).status).toBe(200);
  });

  it("answers 412, not 304, when an If-Match precondition fails", async () => {
    expect((await get("season.json", { headers: { "If-Match": '"stale"' } })).status).toBe(412);
    expect((await get("season.json", { headers: { "If-Match": ETAG } })).status).toBe(200);
    const before = new Date(UPLOADED.getTime() - 60_000).toUTCString();
    expect((await get("season.json", { headers: { "If-Unmodified-Since": before } })).status).toBe(412);
  });

  it("answers 404 for a document that isn't published", async () => {
    expect((await get("history.json")).status).toBe(404);
  });

  it.each(["../secret.json", "a/../b.json", "season.txt", "Season.json", "", "/season.json"])(
    "refuses the key %j",
    async (key) => {
      expect((await get(key)).status).toBe(400);
    },
  );

  it("is read-only", async () => {
    expect((await get("season.json", { method: "PUT", body: "{}" })).status).toBe(405);
  });
});

describe("GET /api/latest/<server>.json", () => {
  const latest = (server: string, e: WorkerEnv, init: RequestInit = {}) =>
    handleLatest(new Request(`https://einkk.example/api/latest/${server}.json`, init), e, server);

  it("serves the prediction for the season season.json names, with its own ETag", async () => {
    const { env: e, reads } = bucket({
      "season.json": { body: SEASON, etag: ETAG },
      "predictions/s42/jp.json": { body: PREDICTION, etag: PREDICTION_ETAG },
    });
    const response = await latest("jp", e);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PREDICTION);
    expect(response.headers.get("ETag")).toBe(PREDICTION_ETAG);
    expect(response.headers.get("Cache-Control")).toBe(`public, max-age=${MAX_AGE_SECONDS}`);
    expect(reads).toEqual(["season.json", "predictions/s42/jp.json"]);
    expect((await latest("jp", e, { headers: { "If-None-Match": PREDICTION_ETAG } })).status).toBe(304);
  });

  it("answers 404 when there is no season or no prediction for this server yet", async () => {
    expect((await latest("jp", bucket({}).env)).status).toBe(404);
    expect((await latest("kr", bucket({ "season.json": { body: SEASON, etag: ETAG } }).env)).status).toBe(404);
  });

  it.each(["JP", "xx", "jp/../season", ""])("refuses the server %j", async (server) => {
    expect((await latest(server, env)).status).toBe(400);
  });

  it("is read-only", async () => {
    expect((await latest("jp", env, { method: "POST", body: "{}" })).status).toBe(405);
  });
});

describe("edge cache", () => {
  // the Workers Cache API, as far as the Worker uses it
  function fakeCache() {
    const entries = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (key: string) => entries.get(key)?.clone(),
        put: async (key: string, response: Response) => void entries.set(key, response),
      },
    });
    return entries;
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads R2 once per document and serves repeats from the cache, 304s included", async () => {
    const entries = fakeCache();
    const { env: e, reads } = bucket({ "season.json": { body: SEASON, etag: ETAG } });
    const first = await get("season.json", {}, e);
    expect(first.headers.get("X-Outbox-Cache")).toBe("miss");
    expect([...entries.keys()]).toEqual(["https://einkk.example/api/outbox/season.json"]);
    expect(entries.get("https://einkk.example/api/outbox/season.json")?.headers.get("Cache-Control"))
      .toBe(`public, max-age=${STALE_SECONDS}`);
    expect(first.headers.get("Cache-Control")).toBe(`public, max-age=${MAX_AGE_SECONDS}`);

    const second = await get("season.json", {}, e);
    expect(second.headers.get("X-Outbox-Cache")).toBe("hit");
    expect(await second.text()).toBe(SEASON);
    expect(second.headers.get("ETag")).toBe(ETAG);
    expect(second.headers.has("X-Outbox-Uploaded")).toBe(false);
    expect((await get("season.json", { headers: { "If-None-Match": ETAG } }, e)).status).toBe(304);
    const before = new Date(UPLOADED.getTime() - 60_000).toUTCString();
    expect((await get("season.json", { headers: { "If-Unmodified-Since": before } }, e)).status).toBe(412);
    expect(reads).toEqual(["season.json"]);
  });

  it("remembers a missing document too", async () => {
    fakeCache();
    const { env: e, reads } = bucket({});
    expect((await get("history.json", {}, e)).status).toBe(404);
    const again = await get("history.json", {}, e);
    expect(again.status).toBe(404);
    expect(again.headers.get("X-Outbox-Cache")).toBe("hit");
    expect(again.headers.get("Cache-Control")).toBe("no-store");
    expect(reads).toEqual(["history.json"]);
  });

  it("shares entries between the latest route and the outbox route", async () => {
    fakeCache();
    const { env: e, reads } = bucket({
      "season.json": { body: SEASON, etag: ETAG },
      "predictions/s42/jp.json": { body: PREDICTION, etag: PREDICTION_ETAG },
    });
    await get("season.json", {}, e);
    await handleLatest(new Request("https://einkk.example/api/latest/jp.json"), e, "jp");
    const direct = await get("predictions/s42/jp.json", {}, e);
    expect(direct.headers.get("X-Outbox-Cache")).toBe("hit");
    expect(reads).toEqual(["season.json", "predictions/s42/jp.json"]);
  });

  describe("stale-while-revalidate", () => {
    const T0 = Date.parse("2026-10-20T00:00:00Z");
    const at = (ms: number) => vi.setSystemTime(T0 + ms);
    const NEW = JSON.stringify({ schema_version: "0.1.0", season: 43 });

    it("serves a copy older than MAX_AGE at once and refreshes it from R2 behind the response", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      fakeCache();
      const objects = { "season.json": { body: SEASON, etag: ETAG } };
      const { env: e, reads } = bucket(objects);
      at(0);
      expect((await get("season.json", {}, e)).headers.get("X-Outbox-Cache")).toBe("miss");
      at(MAX_AGE_SECONDS * 1000 - 1);
      expect((await get("season.json", {}, e)).headers.get("X-Outbox-Cache")).toBe("hit");
      expect(reads).toHaveLength(1);

      objects["season.json"] = { body: NEW, etag: '"new"' };       // the engine publishes
      at(MAX_AGE_SECONDS * 1000 + 1);
      const stale = await get("season.json", {}, e);
      expect(stale.headers.get("X-Outbox-Cache")).toBe("stale");
      expect(await stale.text()).toBe(SEASON);                     // the copy, not a wait on R2
      expect(stale.headers.get("ETag")).toBe(ETAG);
      expect(reads).toHaveLength(2);                               // ... while R2 was read again

      const after = await get("season.json", {}, e);
      expect(after.headers.get("X-Outbox-Cache")).toBe("hit");
      expect(await after.text()).toBe(NEW);
      expect(after.headers.get("ETag")).toBe('"new"');
      expect(reads).toHaveLength(2);
    });

    it("answers conditional requests from a stale copy too", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      fakeCache();
      const { env: e } = bucket({ "season.json": { body: SEASON, etag: ETAG } });
      at(0);
      await get("season.json", {}, e);
      at(MAX_AGE_SECONDS * 1000 + 1);
      const response = await get("season.json", { headers: { "If-None-Match": ETAG } }, e);
      expect(response.status).toBe(304);
      expect(response.headers.get("X-Outbox-Cache")).toBe("stale");
    });

    it("refreshes in waitUntil when the runtime gives a context", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      fakeCache();
      const { env: e, reads } = bucket({ "season.json": { body: SEASON, etag: ETAG } });
      const pending: Promise<unknown>[] = [];
      const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) } as unknown as ExecutionContext;
      const read = (init: RequestInit = {}) =>
        handleOutbox(new Request("https://einkk.example/api/outbox/season.json", init), e, "season.json", ctx);
      at(0);
      await read();
      await Promise.all(pending.splice(0));
      at(MAX_AGE_SECONDS * 1000 + 1);
      expect((await read()).headers.get("X-Outbox-Cache")).toBe("stale");
      expect(pending).toHaveLength(1);
      await Promise.all(pending.splice(0));
      expect(reads).toHaveLength(2);
      expect((await read()).headers.get("X-Outbox-Cache")).toBe("hit");
    });

    it("keeps serving the copy when the refresh fails", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      fakeCache();
      const objects: Record<string, { body: string; etag: string }> = { "season.json": { body: SEASON, etag: ETAG } };
      const { env: e } = bucket(objects);
      at(0);
      await get("season.json", {}, e);
      (e.OUTBOX as unknown as { get: () => Promise<never> }).get = async () => { throw new Error("R2 down"); };
      at(MAX_AGE_SECONDS * 1000 + 1);
      const response = await get("season.json", {}, e);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(SEASON);
      expect(response.headers.get("X-Outbox-Cache")).toBe("stale");
    });

    it("keeps a missing document for MAX_AGE only, so a new one shows up as fast as before", async () => {
      const entries = fakeCache();
      const { env: e } = bucket({});
      await get("predictions/s43/jp.json", {}, e);
      expect(entries.get("https://einkk.example/api/outbox/predictions/s43/jp.json")?.headers.get("Cache-Control"))
        .toBe(`public, max-age=${MAX_AGE_SECONDS}`);
    });
  });
});
