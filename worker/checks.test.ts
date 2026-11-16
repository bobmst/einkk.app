// #100: the checker's anonymous record. One row per network, server and damage within
// DEDUPE_HOURS, at most CHECKS_PER_HOUR per network, nothing outside the ranked window.
import { Validator, type Schema } from "@cfworker/json-schema";
import { beforeEach, describe, expect, it } from "vitest";
import checkSchema from "../contracts/check.schema.json";
import { CHECKS_PER_HOUR, DEDUPE_HOURS, handleCheck } from "./checks";
import type { WorkerEnv } from "./env";
import { seasonKeyFor } from "./reports";

const NOW = new Date("2026-10-30T03:41:12Z");
const IP = "203.0.113.7";
const SEASON = { season: 42, starts_at: "2026-10-25T20:00:00Z", ends_at: "2026-10-30T19:59:00Z" };

interface Row { id: string; checked_at: string; season: number; server: string; season_key: string; damage: number; doc: string }

// The one statement checks.ts runs, against an in-memory table.
class FakeD1 {
  rows: Row[] = [];
  prepare(sql: string) {
    return {
      bind: (...args: unknown[]) => ({
        run: async () => {
          expect(sql).toContain("INSERT INTO checks");
          const [id, checked_at, season, server, season_key, damage, doc, k1, srv, dmg, since, k2, hour, limit] =
            args as [string, string, number, string, string, number, string, string, string, number, string, string, string, number];
          const repeat = this.rows.some((r) => r.season_key === k1 && r.server === srv && r.damage === dmg
            && r.checked_at > since);
          const recent = this.rows.filter((r) => r.season_key === k2 && r.checked_at > hour).length;
          if (repeat || recent >= limit) return { success: true, meta: { changes: 0 } };
          this.rows.push({ id, checked_at, season, server, season_key, damage, doc });
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
beforeEach(() => {
  db = new FakeD1();
  env = { INBOX: db, OUTBOX: fakeOutbox(SEASON), RATE_KEY_SALT: "salt", SITE_MODE: "production" } as unknown as WorkerEnv;
});

const valid = { server: "jp", season: 42, damage: 223.16 };
const post = (body: unknown, ip = IP) => new Request("https://einkk.example/api/checks", {
  method: "POST",
  headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
  body: JSON.stringify(body),
});
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

describe("POST /api/checks", () => {
  it("stores a valid check with the network's season key, and it meets the contract", async () => {
    const res = await handleCheck(post(valid), env, NOW);
    expect(res.status).toBe(201);
    expect(db.rows).toHaveLength(1);
    const doc = JSON.parse(db.rows[0].doc);
    expect(doc.client).toEqual({ season_key: await seasonKeyFor("salt", 42, IP) });
    expect(doc.checked_at).toBe("2026-10-30T03:41:12Z");
    expect(new Validator(checkSchema as unknown as Schema, "2020-12", false).validate(doc).valid).toBe(true);
  });

  it("counts the same network, server and damage once within the dedupe window", async () => {
    expect((await handleCheck(post(valid), env, NOW)).status).toBe(201);
    expect((await handleCheck(post(valid), env, later(1))).status).toBe(204);
    expect((await handleCheck(post({ ...valid, server: "kr" }), env, later(1))).status).toBe(201);
    expect((await handleCheck(post(valid, "198.51.100.9"), env, later(1))).status).toBe(201);
    expect((await handleCheck(post(valid), env, later(DEDUPE_HOURS + 0.1))).status).toBe(201);
    expect(db.rows).toHaveLength(4);
  });

  it("caps one network's checks per hour", async () => {
    for (let i = 0; i < CHECKS_PER_HOUR; i++) {
      expect((await handleCheck(post({ ...valid, damage: 200 + i }), env, NOW)).status).toBe(201);
    }
    expect((await handleCheck(post({ ...valid, damage: 999 }), env, NOW)).status).toBe(204);
    expect(db.rows).toHaveLength(CHECKS_PER_HOUR);
  });

  it("stores nothing outside the ranked window or for another season", async () => {
    expect((await handleCheck(post(valid), env, new Date("2026-10-25T19:59:00Z"))).status).toBe(403);
    expect((await handleCheck(post(valid), env, new Date("2026-10-30T20:00:00Z"))).status).toBe(403);
    expect((await handleCheck(post({ ...valid, season: 41 }), env, NOW)).status).toBe(403);
    env = { ...env, OUTBOX: fakeOutbox(null) } as unknown as WorkerEnv;
    expect((await handleCheck(post(valid), env, NOW)).status).toBe(403);
    expect(db.rows).toHaveLength(0);
  });

  it("refuses a rank, a raw score and unknown fields", async () => {
    expect((await handleCheck(post({ ...valid, rank_pc: 2.9 }), env, NOW)).status).toBe(400);
    expect((await handleCheck(post({ ...valid, damage: 22316000000 }), env, NOW)).status).toBe(400);
    expect((await handleCheck(post({ ...valid, server: "global" }), env, NOW)).status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it("answers 503 without the salt", async () => {
    env = { ...env, RATE_KEY_SALT: undefined } as unknown as WorkerEnv;
    expect((await handleCheck(post(valid), env, NOW)).status).toBe(503);
  });
});
