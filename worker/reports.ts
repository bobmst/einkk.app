// POST /api/reports: one in-raid player report into the D1 inbox
// (contracts/report.schema.json; docs/ARCHITECTURE.md, "Decided").
//
// Order matters: cheap local checks first, then the stored document is built
// and validated against the contract, and only then do the Turnstile call and
// the rate-limit query run. Nothing is stored unless every step passes.
import { Validator, type Schema } from "@cfworker/json-schema";
import reportSchema from "../contracts/report.schema.json";
import type { WorkerEnv } from "./env";
import { error, json } from "./http";

const validator = new Validator(reportSchema as unknown as Schema, "2020-12", false);
const SCHEMA_VERSION = reportSchema.properties.schema_version.const;
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const MAX_BODY_BYTES = 4096;
export const REPORTS_PER_HOUR = 10;

// What a player may send. Everything else in the stored document is set here.
const PLAYER_FIELDS = ["server", "season", "rank_pc", "rank_n", "damage", "read_at"] as const;
const REQUEST_FIELDS = new Set<string>([...PLAYER_FIELDS, "turnstile_token"]);

export async function handleReport(request: Request, env: WorkerEnv, now = new Date()): Promise<Response> {
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return error(403, "cross_origin");
  if (!(request.headers.get("Content-Type") ?? "").startsWith("application/json")) {
    return error(415, "json_only");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return error(413, "too_large");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return error(400, "bad_json");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return error(400, "bad_json");
  const fields = body as Record<string, unknown>;
  const unknown = Object.keys(fields).filter((key) => !REQUEST_FIELDS.has(key));
  if (unknown.length) return error(400, "unknown_fields", { fields: unknown });

  if (!env.TURNSTILE_SECRET || !env.RATE_KEY_SALT) return error(503, "intake_not_configured");
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const rateKey = await rateKeyFor(env.RATE_KEY_SALT, ip, now);

  const doc: Record<string, unknown> = { schema_version: SCHEMA_VERSION, id: crypto.randomUUID() };
  for (const key of PLAYER_FIELDS) if (key in fields) doc[key] = fields[key];
  doc.submitted_at = now.toISOString();
  doc.client = { turnstile: true, rate_key: rateKey };   // stored only if the check below passes

  const check = validator.validate(doc);
  if (!check.valid) {
    const errors = check.errors
      .filter((e) => e.instanceLocation !== "#")
      .slice(0, 5)
      .map((e) => ({ at: e.instanceLocation, rule: e.keyword }));
    return error(400, "invalid_report", { errors: errors.length ? errors : [{ at: "#", rule: "oneOf" }] });
  }

  // previews run Cloudflare's always-pass test key, whose verdict names no real host
  const host = env.SITE_MODE === "production" ? new URL(request.url).hostname : null;
  if (!(await turnstilePassed(env.TURNSTILE_SECRET, fields.turnstile_token, ip, host))) {
    return error(403, "turnstile_failed");
  }
  if (await overLimit(env.INBOX, rateKey, now)) return error(429, "rate_limited");

  await env.INBOX.prepare(
    "INSERT INTO reports (id, submitted_at, season, server, rate_key, doc) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(doc.id, doc.submitted_at, doc.season, doc.server, rateKey, JSON.stringify(doc))
    .run();
  return json({ id: doc.id }, 201);
}

// SHA-256 of a secret salt, the UTC day and the client address. The day is in
// the hash so one player's reports can't be linked across days; the address
// itself is never stored.
export async function rateKeyFor(salt: string, ip: string, now: Date): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${now.toISOString().slice(0, 10)}:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// A pass only counts if the token was issued on this site's own host (siteverify
// reports where the widget ran), not on another page using the same site key.
async function turnstilePassed(secret: string, token: unknown, ip: string, host: string | null): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const response = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
  if (!response.ok) return false;
  const outcome = (await response.json()) as { success?: boolean; hostname?: string };
  return outcome.success === true && (host === null || outcome.hostname === host);
}

async function overLimit(db: D1Database, rateKey: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM reports WHERE rate_key = ? AND submitted_at > ?")
    .bind(rateKey, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= REPORTS_PER_HOUR;
}
