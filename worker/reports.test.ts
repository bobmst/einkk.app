import { Validator, type Schema } from "@cfworker/json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reportSchema from "../contracts/report.schema.json";
import type { WorkerEnv } from "./env";
import { handleReport, rateKeyFor, REPORTS_PER_HOUR } from "./reports";

const NOW = new Date("2026-10-30T03:41:12Z");
const IP = "203.0.113.7";

interface Row { id: string; submitted_at: string; season: number; server: string; rate_key: string; doc: string }

// The two statements reports.ts runs, against an in-memory table.
class FakeD1 {
  rows: Row[] = [];
  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        run: async () => {
          const [id, submitted_at, season, server, rate_key, doc] = args as [string, string, number, string, string, string];
          this.rows.push({ id, submitted_at, season, server, rate_key, doc });
          return { success: true };
        },
        first: async () => {
          expect(sql).toContain("COUNT(*)");
          const [rateKey, since] = args as [string, string];
          return { n: this.rows.filter((r) => r.rate_key === rateKey && r.submitted_at > since).length };
        },
      }),
    };
  }
}

let db: FakeD1;
let env: WorkerEnv;
let turnstile: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = new FakeD1();
  env = { INBOX: db, TURNSTILE_SECRET: "secret", RATE_KEY_SALT: "salt" } as unknown as WorkerEnv;
  turnstile = vi.fn(async () => Response.json({ success: true }));
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
    expect(doc.submitted_at).toBe(NOW.toISOString());
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
});
