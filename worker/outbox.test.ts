import { describe, expect, it } from "vitest";
import type { WorkerEnv } from "./env";
import { handleOutbox, MAX_AGE_SECONDS } from "./outbox";

const ETAG = '"abc123"';
const SEASON = JSON.stringify({ schema_version: "0.1.0", season: 42 });

// R2's get(): null when missing; metadata only when If-None-Match matches.
const env = {
  OUTBOX: {
    get: async (key: string, options?: { onlyIf?: Headers }) => {
      if (key !== "season.json") return null;
      if (options?.onlyIf?.get("If-None-Match") === ETAG) return { httpEtag: ETAG };
      return { httpEtag: ETAG, body: SEASON };
    },
  },
} as unknown as WorkerEnv;

const get = (key: string, init: RequestInit = {}) =>
  handleOutbox(new Request(`https://einkk.example/api/outbox/${key}`, init), env, key);

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
