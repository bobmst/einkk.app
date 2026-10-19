import { Validator, type Schema } from "@cfworker/json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import finalSchema from "../contracts/final-report.schema.json";
import type { WorkerEnv } from "./env";
import { FINALS_PER_HOUR, handleFinal } from "./finals";

// S42: ranked play closed 10/31 04:59 JST; the survey closes 11/20 23:59 JST
const SEASON = {
  season: 42, starts_at: "2026-10-25T20:00:00Z", ends_at: "2026-10-30T19:59:00Z", state: "measuring",
  survey: { url: "https://tally.so/r/abc", opens_at: "2026-10-30T20:00:00Z", closes_at: "2026-11-20T14:59:00Z" },
};
const NOW = new Date("2026-11-02T11:00:00Z");
const IP = "203.0.113.7";
const BROWSER = "0b8f2a6e-3c4d-4e5f-9a0b-1c2d3e4f5a6b";

interface Row { id: string; submitted_at: string; season: number; server: string; season_key: string; browser_key: string; doc: string }

class FakeD1 {
  rows: Row[] = [];
  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        run: async () => {
          expect(sql).toContain("INSERT INTO final_reports");
          expect(sql).toContain("FROM final_reports");
          const [id, submitted_at, season, server, season_key, browser_key, doc, key, since, limit] =
            args as [string, string, number, string, string, string, string, string, string, number];
          const n = this.rows.filter((r) => r.season_key === key && r.submitted_at > since).length;
          if (n >= limit) return { success: true, meta: { changes: 0 } };
          this.rows.push({ id, submitted_at, season, server, season_key, browser_key, doc });
          return { success: true, meta: { changes: 1 } };
        },
      }),
    };
  }
}

const fakeOutbox = (doc: unknown) => ({
  get: async (key: string) => (key === "season.json" && doc ? { json: async () => doc } : null),
});

let db: FakeD1;
let env: WorkerEnv;
let turnstile: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = new FakeD1();
  env = { INBOX: db, OUTBOX: fakeOutbox(SEASON), TURNSTILE_SECRET: "secret", RATE_KEY_SALT: "salt",
    SITE_MODE: "production" } as unknown as WorkerEnv;
  turnstile = vi.fn(async () => Response.json({ success: true, hostname: "einkk.example" }));
  vi.stubGlobal("fetch", turnstile);
});
afterEach(() => vi.unstubAllGlobals());

const valid = { server: "gb", season: 42, rank_pc: 2.97, damage: 251.3, browser_id: BROWSER, turnstile_token: "token" };

function post(body: unknown, ip = IP) {
  return new Request("https://einkk.example/api/finals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/finals", () => {
  it("stores a contract-valid final result with two hashed keys and no address or browser id", async () => {
    const response = await handleFinal(post(valid), env, NOW);
    expect(response.status).toBe(201);
    expect(db.rows).toHaveLength(1);
    const doc = JSON.parse(db.rows[0].doc);
    expect(new Validator(finalSchema as unknown as Schema, "2020-12").validate(doc).valid).toBe(true);
    expect(doc.client.season_key).toBe(db.rows[0].season_key);
    expect(doc.client.browser_key).toBe(db.rows[0].browser_key);
    expect(db.rows[0].doc).not.toContain(IP);
    expect(db.rows[0].doc).not.toContain(BROWSER);
    expect(doc).not.toHaveProperty("read_at");
  });

  it("gives one network the same key all season, and one browser the same key on any network", async () => {
    await handleFinal(post(valid), env, NOW);
    await handleFinal(post(valid), env, new Date("2026-11-09T11:00:00Z"));
    await handleFinal(post(valid, "198.51.100.9"), env, NOW);
    await handleFinal(post({ ...valid, browser_id: "1b8f2a6e-3c4d-4e5f-9a0b-1c2d3e4f5a6b" }), env, NOW);
    const [a, b, c, d] = db.rows;
    expect(b.season_key).toBe(a.season_key);
    expect(c.season_key).not.toBe(a.season_key);
    expect(c.browser_key).toBe(a.browser_key);
    expect(d.browser_key).not.toBe(a.browser_key);
    expect(d.season_key).toBe(a.season_key);
  });

  it.each([
    ["while the raid is still running", new Date("2026-10-30T19:59:30Z"), valid],
    ["after the survey window", new Date("2026-11-20T15:00:00Z"), valid],
    ["for another season", NOW, { ...valid, season: 41 }],
  ])("refuses a final result %s, before calling Turnstile", async (_name, at, body) => {
    const response = await handleFinal(post(body), env, at);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "closed" });
    expect(turnstile).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it("opens at the close and, before the survey form exists, runs to END + 20 days 23:59 JST", async () => {
    env = { ...env, OUTBOX: fakeOutbox({ ...SEASON, survey: null }) } as unknown as WorkerEnv;
    expect((await handleFinal(post(valid), env, new Date("2026-10-30T20:00:00Z"))).status).toBe(201);
    expect((await handleFinal(post(valid), env, new Date("2026-11-20T14:59:59Z"))).status).toBe(201);
    expect((await handleFinal(post(valid), env, new Date("2026-11-20T15:00:00Z"))).status).toBe(403);
  });

  describe("after the next season is published", () => {
    // S43 announced inside S42's final window; the engine carries S42 along as `previous`
    const NEXT = {
      season: 43, starts_at: "2026-11-24T20:00:00Z", ends_at: "2026-11-29T19:59:00Z", state: "upcoming",
      survey: null,
      previous: { season: 42, starts_at: SEASON.starts_at, ends_at: SEASON.ends_at, survey: SEASON.survey },
    };
    beforeEach(() => {
      env = { ...env, OUTBOX: fakeOutbox(NEXT) } as unknown as WorkerEnv;
    });

    it("still takes the previous season's final results through its survey window", async () => {
      expect((await handleFinal(post(valid), env, NOW)).status).toBe(201);
      expect((await handleFinal(post(valid), env, new Date("2026-11-20T14:59:59Z"))).status).toBe(201);
      expect(db.rows.map((r) => r.season)).toEqual([42, 42]);
    });

    it("closes the previous season at the end of its own window", async () => {
      const response = await handleFinal(post(valid), env, new Date("2026-11-20T15:00:00Z"));
      expect(response.status).toBe(403);
      expect(turnstile).not.toHaveBeenCalled();
    });

    it("runs the previous window to END + 20 days 23:59 JST when its form doesn't exist", async () => {
      env = { ...env, OUTBOX: fakeOutbox({ ...NEXT, previous: { ...NEXT.previous, survey: null } }) } as unknown as WorkerEnv;
      expect((await handleFinal(post(valid), env, new Date("2026-11-20T14:59:59Z"))).status).toBe(201);
      expect((await handleFinal(post(valid), env, new Date("2026-11-20T15:00:00Z"))).status).toBe(403);
    });

    it.each([
      ["the new season, before it has run", { ...valid, season: 43 }],
      ["a season older than the previous one", { ...valid, season: 41 }],
    ])("refuses %s", async (_name, body) => {
      expect((await handleFinal(post(body), env, NOW)).status).toBe(403);
    });

    it("ignores a `previous` that isn't older than the published season", async () => {
      const doc = { ...NEXT, previous: { ...NEXT.previous, season: 43 } };
      env = { ...env, OUTBOX: fakeOutbox({ ...doc, season: 42 }) } as unknown as WorkerEnv;
      expect((await handleFinal(post({ ...valid, season: 43 }), env, NOW)).status).toBe(403);
    });

    it("refuses the previous season's results without `previous` (a 0.1.0 document)", async () => {
      env = { ...env, OUTBOX: fakeOutbox({ ...NEXT, previous: undefined }) } as unknown as WorkerEnv;
      expect((await handleFinal(post(valid), env, NOW)).status).toBe(403);
    });
  });

  it.each([
    ["no browser id",{ ...valid, browser_id: undefined }],
    ["a browser id that isn't a UUID", { ...valid, browser_id: "me" }],
    ["a read time (in-raid field)", { ...valid, read_at: "2026-10-31T04:00:00+09:00" }],
    ["both ranks", { ...valid, rank_n: 80 }],
  ])("rejects %s", async (_name, body) => {
    expect((await handleFinal(post(body), env, NOW)).status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it("limits one network to its hourly allowance", async () => {
    for (let i = 0; i < FINALS_PER_HOUR; i++) expect((await handleFinal(post(valid), env, NOW)).status).toBe(201);
    expect((await handleFinal(post(valid), env, NOW)).status).toBe(429);
  });

  it("stores nothing when Turnstile fails", async () => {
    turnstile.mockResolvedValueOnce(Response.json({ success: false }));
    expect((await handleFinal(post(valid), env, NOW)).status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });
});
