import { Validator, type Schema } from "@cfworker/json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reportSchema from "../contracts/report.schema.json";
import type { WorkerEnv } from "./env";
import { handleReport, rateKeyFor, REPORTS_PER_HOUR } from "./reports";

const NOW = new Date("2026-10-30T03:41:12Z");
const IP = "203.0.113.7";

interface Row { id: string; submitted_at: string; season: number; server: string; rate_key: string; doc: string }

// The one statement reports.ts runs, against an in-memory table: an INSERT that
// only lands while the key has fewer than `limit` rows in the last hour.
class FakeD1 {
  rows: Row[] = [];
  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        run: async () => {
          expect(sql).toContain("INSERT INTO reports");
          expect(sql).toContain("COUNT(*)");
          const [id, submitted_at, season, server, rate_key, doc, key, earlierKey, since, limit] =
            args as [string, string, number, string, string, string, string, string, string, number];
          const n = this.rows.filter((r) => (r.rate_key === key || r.rate_key === earlierKey)
            && r.submitted_at > since).length;
          if (n >= limit) return { success: true, meta: { changes: 0 } };
          this.rows.push({ id, submitted_at, season, server, rate_key, doc });
          return { success: true, meta: { changes: 1 } };
        },
      }),
    };
  }
}

// season.json as the engine publishes it: S42 ranked 10/26 05:00 to 10/31 04:59 JST
const SEASON = { season: 42, starts_at: "2026-10-25T20:00:00Z", ends_at: "2026-10-30T19:59:00Z" };
const fakeOutbox = (doc: unknown) => ({
  get: async (key: string) => (key === "season.json" && doc ? { json: async () => doc } : null),
});

let db: FakeD1;
let env: WorkerEnv;
let turnstile: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = new FakeD1();
  env = { INBOX: db, OUTBOX: fakeOutbox(SEASON), TURNSTILE_SECRET: "secret", RATE_KEY_SALT: "salt", SITE_MODE: "production" } as unknown as WorkerEnv;
  turnstile = vi.fn(async () => Response.json({ success: true, hostname: "einkk.example" }));
  vi.stubGlobal("fetch", turnstile);
});
afterEach(() => vi.unstubAllGlobals());

const valid = { server: "jp", season: 42, rank_pc: 2.85, damage: 223.16, read_at: "2026-10-30T12:40:00+09:00", turnstile_token: "token" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://einkk.example/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": IP, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  it("stores a valid report as a contract-valid document without the IP", async () => {
    const response = await handleReport(post(valid), env, NOW);
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(db.rows).toHaveLength(1);
    const doc = JSON.parse(db.rows[0].doc);
    expect(doc.id).toBe(id);
    // UTC to the second, the engine's storage format; the read time too, whatever zone it came in
    expect(doc.submitted_at).toBe("2026-10-30T03:41:12Z");
    expect(doc.read_at).toBe("2026-10-30T03:40:00Z");
    expect(db.rows[0].submitted_at).toBe("2026-10-30T03:41:12Z");
    expect(doc.client).toEqual({ turnstile: true, rate_key: await rateKeyFor("salt", IP, NOW) });
    expect(new Validator(reportSchema as unknown as Schema, "2020-12").validate(doc).valid).toBe(true);
    expect(db.rows[0].doc).not.toContain(IP);
    expect(doc).not.toHaveProperty("turnstile_token");
  });

  it("rejects a report that breaks the contract, before calling Turnstile", async () => {
    const response = await handleReport(post({ ...valid, rank_n: 120 }), env, NOW);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_report" });
    expect(turnstile).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it("rejects fields the form never sends, such as an image", async () => {
    const response = await handleReport(post({ ...valid, screenshot: "data:image/png;base64,AA" }), env, NOW);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unknown_fields", fields: ["screenshot"] });
  });

  it("stores nothing when Turnstile fails", async () => {
    turnstile.mockResolvedValueOnce(Response.json({ success: false }));
    const response = await handleReport(post(valid), env, NOW);
    expect(response.status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });

  it("answers 429 once a key has sent its hourly allowance", async () => {
    for (let i = 0; i < REPORTS_PER_HOUR; i++) {
      expect((await handleReport(post(valid), env, NOW)).status).toBe(201);
    }
    expect((await handleReport(post(valid), env, NOW)).status).toBe(429);
    const nextHour = new Date(NOW.getTime() + 3_600_001);
    expect((await handleReport(post(valid), env, nextHour)).status).toBe(201);
  });

  it("keeps the hourly limit across UTC midnight, where the rate key changes", async () => {
    const lateNight = new Date("2026-10-29T23:55:00Z");
    for (let i = 0; i < REPORTS_PER_HOUR; i++) {
      expect((await handleReport(post(valid), env, lateNight)).status).toBe(201);
    }
    expect((await handleReport(post(valid), env, new Date("2026-10-30T00:01:00Z"))).status).toBe(429);
    expect((await handleReport(post(valid), env, new Date("2026-10-30T00:55:01Z"))).status).toBe(201);
  });

  it("refuses a read time the contract allows but JavaScript can't read", async () => {
    // a leap second passes the format check (only at 23:59:60 UTC) but is NaN to Date
    const response = await handleReport(post({ ...valid, read_at: "2026-10-29T23:59:60Z" }), env, NOW);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_report", errors: [{ at: "#/read_at", rule: "format" }] });
    expect(db.rows).toHaveLength(0);
  });

  it.each([
    ["before ranked play starts", new Date("2026-10-25T19:59:59Z"), valid],
    ["after the last minute", new Date("2026-10-30T20:00:00Z"), valid],
    ["for another season", NOW, { ...valid, season: 41 }],
  ])("refuses a report %s, before calling Turnstile", async (_name, at, body) => {
    const response = await handleReport(post(body), env, at);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "closed" });
    expect(turnstile).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });

  it("takes a report in the ranked window's first and last minute", async () => {
    expect((await handleReport(post(valid), env, new Date("2026-10-25T20:00:00Z"))).status).toBe(201);
    expect((await handleReport(post(valid), env, new Date("2026-10-30T19:59:59Z"))).status).toBe(201);
  });

  it("refuses everything while no season is published", async () => {
    env = { ...env, OUTBOX: fakeOutbox(null) } as unknown as WorkerEnv;
    expect((await handleReport(post(valid), env, NOW)).status).toBe(403);
  });

  it("answers 503 while a secret is missing", async () => {
    const response = await handleReport(post(valid), { ...env, RATE_KEY_SALT: undefined }, NOW);
    expect(response.status).toBe(503);
  });

  it.each([
    ["a cross-origin post", post(valid, { Origin: "https://evil.example" }), 403],
    ["a non-JSON body", post("server=jp", { "Content-Type": "application/x-www-form-urlencoded" }), 415],
    ["an oversized body", post({ ...valid, turnstile_token: "x".repeat(5000) }), 413],
    ["malformed JSON", post("{"), 400],
    ["a JSON array", post("[]"), 400],
    ["a GET", new Request("https://einkk.example/api/reports"), 405],
  ])("refuses %s", async (_name, request, status) => {
    expect((await handleReport(request, env, NOW)).status).toBe(status);
    expect(db.rows).toHaveLength(0);
  });
});

describe("rateKeyFor", () => {
  it("is a SHA-256 hex digest that changes every UTC day", async () => {
    const today = await rateKeyFor("salt", IP, NOW);
    expect(today).toMatch(/^[0-9a-f]{64}$/);
    expect(await rateKeyFor("salt", IP, new Date("2026-10-30T23:59:59Z"))).toBe(today);
    expect(await rateKeyFor("salt", IP, new Date("2026-10-31T00:00:00Z"))).not.toBe(today);
    expect(await rateKeyFor("other-salt", IP, NOW)).not.toBe(today);
  });

  it("rejects a Turnstile pass issued on another host", async () => {
    turnstile.mockImplementationOnce(async () => Response.json({ success: true, hostname: "evil.example" }));
    const response = await handleReport(post(valid), env, NOW);
    expect(response.status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });

  it("skips the host check on previews (Cloudflare's test key names no real host)", async () => {
    env = { ...env, SITE_MODE: "rehearsal" } as unknown as WorkerEnv;
    turnstile.mockImplementationOnce(async () => Response.json({ success: true, hostname: "example.com" }));
    expect((await handleReport(post(valid), env, NOW)).status).toBe(201);
  });
});
