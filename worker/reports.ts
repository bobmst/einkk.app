// POST /api/reports: one in-raid player report into the D1 inbox
// (contracts/report.schema.json; docs/ARCHITECTURE.md, "Decided").
//
// Order matters: cheap local checks first, then the stored document is built
// and validated against the contract, and only then do the Turnstile call and
// the rate-limited insert run. Nothing is stored unless every step passes.
// Reports are taken only for the published season and only inside its ranked
// window (season.json's starts_at..ends_at): the raid opens a couple of days
// before ranked damage counts, and nothing from then is a reading of the line.
import { Validator, type Schema } from "@cfworker/json-schema";
import reportSchema from "../contracts/report.schema.json";
import type { WorkerEnv } from "./env";
import { error, json } from "./http";
import { currentSeason, inRankedWindow } from "./season";

const validator = new Validator(reportSchema as unknown as Schema, "2020-12", false);
const SCHEMA_VERSION = reportSchema.properties.schema_version.const;
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const MAX_BODY_BYTES = 4096;

/** The engine's storage format for an instant (solo_raid_predict#58): UTC, seconds, Z. */
export function utcSeconds(t: Date): string {
  return t.toISOString().replace(/\.\d{3}Z$/, "Z");
}
export const REPORTS_PER_HOUR = 10;

// What a player may send. Everything else in the stored document is set here.
const PLAYER_FIELDS = ["server", "season", "rank_pc", "rank_n", "damage", "read_at"] as const;
const REQUEST_FIELDS = new Set<string>([...PLAYER_FIELDS, "turnstile_token"]);

export async function handleReport(request: Request, env: WorkerEnv, now = new Date()): Promise<Response> {
  const fields = await readFields(request, REQUEST_FIELDS);
  if (fields instanceof Response) return fields;

  if (!env.TURNSTILE_SECRET || !env.RATE_KEY_SALT) return error(503, "intake_not_configured");
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const rateKey = await rateKeyFor(env.RATE_KEY_SALT, ip, now);
  // the hour's window can reach back into yesterday (UTC), whose reports carry yesterday's key
  const earlierKey = await rateKeyFor(env.RATE_KEY_SALT, ip, new Date(now.getTime() - 3_600_000));
  // one network's reports all season (0.2.0); the rate key above changes daily and only limits
  const seasonKey = await seasonKeyFor(env.RATE_KEY_SALT, Number(fields.season), ip);

  const doc: Record<string, unknown> = { schema_version: SCHEMA_VERSION, id: crypto.randomUUID() };
  for (const key of PLAYER_FIELDS) if (key in fields) doc[key] = fields[key];
  doc.submitted_at = utcSeconds(now);
  // stored only if the check below passes
  doc.client = { turnstile: true, rate_key: rateKey, season_key: seasonKey };

  const invalid = contractErrors(validator, doc);
  if (invalid) return invalid;
  // any zone the contract allows -> UTC; a valid RFC 3339 time JS can't read (a leap second) is refused
  const readAt = new Date(doc.read_at as string);
  if (Number.isNaN(readAt.getTime())) {
    return error(400, "invalid_report", { errors: [{ at: "#/read_at", rule: "format" }] });
  }
  doc.read_at = utcSeconds(readAt);

  const season = await currentSeason(env.OUTBOX);
  if (!season || doc.season !== season.season || !inRankedWindow(season, now.getTime())) {
    return error(403, "closed");
  }

  // previews run Cloudflare's always-pass test key, whose verdict names no real host
  const host = env.SITE_MODE === "production" ? new URL(request.url).hostname : null;
  if (!(await turnstilePassed(env.TURNSTILE_SECRET, fields.turnstile_token, ip, host))) {
    return error(403, "turnstile_failed");
  }
  // the limit is checked inside the INSERT, so parallel requests can't all slip under it
  const inserted = await env.INBOX.prepare(
    "INSERT INTO reports (id, submitted_at, season, server, rate_key, doc) SELECT ?, ?, ?, ?, ?, ? "
      + "WHERE (SELECT COUNT(*) FROM reports WHERE rate_key IN (?, ?) AND submitted_at > ?) < ?",
  )
    .bind(doc.id, doc.submitted_at, doc.season, doc.server, rateKey, JSON.stringify(doc),
      rateKey, earlierKey, hourBefore(now), REPORTS_PER_HOUR)
    .run();
  if (!inserted.meta.changes) return error(429, "rate_limited");
  return json({ id: doc.id }, 201);
}

/**
 * The checks every intake makes before reading a body: POST, same origin, JSON,
 * size, an object, and no field beyond the allowed ones. A Response is the refusal.
 */
export async function readFields(request: Request, allowed: Set<string>): Promise<Record<string, unknown> | Response> {
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return error(403, "cross_origin");
  if (!(request.headers.get("Content-Type") ?? "").startsWith("application/json")) {
    return error(415, "json_only");
  }
  // a declared size over the limit is refused before the body is read; the check after
  // reading covers a missing or wrong header
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) return error(413, "too_large");
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
  const unknown = Object.keys(fields).filter((key) => !allowed.has(key));
  if (unknown.length) return error(400, "unknown_fields", { fields: unknown });
  return fields;
}

/** 400 invalid_report naming up to five broken rules, or null when the document passes. */
export function contractErrors(validator: Validator, doc: Record<string, unknown>): Response | null {
  const check = validator.validate(doc);
  if (check.valid) return null;
  const errors = check.errors
    .filter((e) => e.instanceLocation !== "#")
    .slice(0, 5)
    .map((e) => ({ at: e.instanceLocation, rule: e.keyword }));
  return error(400, "invalid_report", { errors: errors.length ? errors : [{ at: "#", rule: "oneOf" }] });
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What a key is made from in place of the address: an IPv4 address as it is, an IPv6
 * address as its /64 network. One connection is handed a whole /64 and its devices move
 * around inside it, so the full address would make one player look like many and give
 * each address its own hourly allowance. Anything unreadable is kept as sent.
 */
export function clientNetwork(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/%.*$/, "");
  if (!address.includes(":")) return address;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1];
  const halves = address.split("::");
  if (halves.length > 2) return address;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return address;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

// SHA-256 of a secret salt, the UTC day and the client's network. The day is in
// the hash, so this key can't link one player's reports across days; the address
// itself is never stored.
export async function rateKeyFor(salt: string, ip: string, now: Date): Promise<string> {
  return sha256Hex(`${salt}:${now.toISOString().slice(0, 10)}:${clientNetwork(ip)}`);
}

// SHA-256 of the salt, the season and the client's network: the same for one network
// all season, on in-raid reports and final results alike, so the engine can tell one
// player's results from many players' without an address or an account.
export async function seasonKeyFor(salt: string, season: number, ip: string): Promise<string> {
  return sha256Hex(`${salt}:season:${season}:${clientNetwork(ip)}`);
}

// A pass only counts if the token was issued on this site's own host (siteverify
// reports where the widget ran), not on another page using the same site key.
export async function turnstilePassed(secret: string, token: unknown, ip: string, host: string | null): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const response = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
    if (!response.ok) return false;
    const outcome = (await response.json()) as { success?: boolean; hostname?: string };
    return outcome.success === true && (host === null || outcome.hostname === host);
  } catch {
    return false;                       // siteverify unreachable or not JSON: no pass, nothing stored
  }
}

/** The start of the rate-limit window: an hour before `now`, in the stored format. */
export function hourBefore(now: Date): string {
  return utcSeconds(new Date(now.getTime() - 3_600_000));
}
