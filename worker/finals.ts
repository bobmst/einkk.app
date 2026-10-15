// POST /api/finals: one player's final result for a season that has closed,
// into the D1 final_reports table (contracts/final-report.schema.json).
//
// Kept apart from the in-raid reports on purpose: those tune the running
// season's forecast, these are our own record of where each server's lines
// ended and feed later seasons. Taken only for the published season, from its
// close through the end of the survey window.
//
// Two salted keys let the engine count distinct players without an address:
// the client address hashed with the season (stable for the whole window) and
// a random id the page keeps in the browser. Reports sharing either key are
// one player there.
import { Validator, type Schema } from "@cfworker/json-schema";
import finalSchema from "../contracts/final-report.schema.json";
import type { WorkerEnv } from "./env";
import { error, json } from "./http";
import { contractErrors, hourBefore, readFields, sha256Hex, turnstilePassed, utcSeconds } from "./reports";
import { currentSeason, inFinalWindow } from "./season";

const validator = new Validator(finalSchema as unknown as Schema, "2020-12", false);
const SCHEMA_VERSION = finalSchema.properties.schema_version.const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FINALS_PER_HOUR = 10;

const PLAYER_FIELDS = ["server", "season", "rank_pc", "rank_n", "damage"] as const;
const REQUEST_FIELDS = new Set<string>([...PLAYER_FIELDS, "browser_id", "turnstile_token"]);

export async function handleFinal(request: Request, env: WorkerEnv, now = new Date()): Promise<Response> {
  const fields = await readFields(request, REQUEST_FIELDS);
  if (fields instanceof Response) return fields;

  if (!env.TURNSTILE_SECRET || !env.RATE_KEY_SALT) return error(503, "intake_not_configured");
  if (typeof fields.browser_id !== "string" || !UUID.test(fields.browser_id)) {
    return error(400, "invalid_report", { errors: [{ at: "#/browser_id", rule: "format" }] });
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const season = Number(fields.season);
  const seasonKey = await sha256Hex(`${env.RATE_KEY_SALT}:season:${season}:${ip}`);
  const browserKey = await sha256Hex(`${env.RATE_KEY_SALT}:browser:${fields.browser_id.toLowerCase()}`);

  const doc: Record<string, unknown> = { schema_version: SCHEMA_VERSION, id: crypto.randomUUID() };
  for (const key of PLAYER_FIELDS) if (key in fields) doc[key] = fields[key];
  doc.submitted_at = utcSeconds(now);
  doc.client = { turnstile: true, season_key: seasonKey, browser_key: browserKey };

  const invalid = contractErrors(validator, doc);
  if (invalid) return invalid;

  const published = await currentSeason(env.OUTBOX);
  if (!published || doc.season !== published.season || !inFinalWindow(published, now)) {
    return error(403, "closed");
  }

  const host = env.SITE_MODE === "production" ? new URL(request.url).hostname : null;
  if (!(await turnstilePassed(env.TURNSTILE_SECRET, fields.turnstile_token, ip, host))) {
    return error(403, "turnstile_failed");
  }
  // the limit is checked inside the INSERT, so parallel requests can't all slip under it
  const inserted = await env.INBOX.prepare(
    "INSERT INTO final_reports (id, submitted_at, season, server, season_key, browser_key, doc) "
      + "SELECT ?, ?, ?, ?, ?, ?, ? "
      + "WHERE (SELECT COUNT(*) FROM final_reports WHERE season_key = ? AND submitted_at > ?) < ?",
  )
    .bind(doc.id, doc.submitted_at, doc.season, doc.server, seasonKey, browserKey, JSON.stringify(doc),
      seasonKey, hourBefore(now), FINALS_PER_HOUR)
    .run();
  if (!inserted.meta.changes) return error(429, "rate_limited");
  return json({ id: doc.id }, 201);
}
