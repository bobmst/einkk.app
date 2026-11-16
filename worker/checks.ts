// POST /api/checks: one damage a player looked up in the checker during a live raid,
// into the D1 checks table (contracts/check.schema.json, #100).
//
// Low-trust by design: no Turnstile, no rank. The page sends one request per distinct
// damage (src/lib/check-record.ts); here the same network, server and damage within
// DEDUPE_HOURS is stored once, and one network stores at most CHECKS_PER_HOUR. Both
// limits sit inside the INSERT, so parallel requests can't slip past them. Taken only
// for the published season inside its ranked window, like the in-raid reports. The
// page ignores every answer: a refusal or a failure never reaches the player.
import { Validator, type Schema } from "@cfworker/json-schema";
import checkSchema from "../contracts/check.schema.json";
import type { WorkerEnv } from "./env";
import { error, json } from "./http";
import { contractErrors, hourBefore, readFields, seasonKeyFor, utcSeconds } from "./reports";
import { currentSeason, inRankedWindow } from "./season";

const validator = new Validator(checkSchema as unknown as Schema, "2020-12", false);
const SCHEMA_VERSION = checkSchema.properties.schema_version.const;

export const DEDUPE_HOURS = 6;
export const CHECKS_PER_HOUR = 30;

const PLAYER_FIELDS = ["server", "season", "damage"] as const;
const REQUEST_FIELDS = new Set<string>(PLAYER_FIELDS);

export async function handleCheck(request: Request, env: WorkerEnv, now = new Date()): Promise<Response> {
  const fields = await readFields(request, REQUEST_FIELDS);
  if (fields instanceof Response) return fields;
  if (!env.RATE_KEY_SALT) return error(503, "intake_not_configured");

  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const seasonKey = await seasonKeyFor(env.RATE_KEY_SALT, Number(fields.season), ip);
  const doc: Record<string, unknown> = { schema_version: SCHEMA_VERSION, id: crypto.randomUUID() };
  for (const key of PLAYER_FIELDS) if (key in fields) doc[key] = fields[key];
  doc.checked_at = utcSeconds(now);
  doc.client = { season_key: seasonKey };

  const invalid = contractErrors(validator, doc);
  if (invalid) return invalid;

  const season = await currentSeason(env.OUTBOX);
  if (!season || doc.season !== season.season || !inRankedWindow(season, now.getTime())) {
    return error(403, "closed");
  }

  const since = utcSeconds(new Date(now.getTime() - DEDUPE_HOURS * 3_600_000));
  const inserted = await env.INBOX.prepare(
    "INSERT INTO checks (id, checked_at, season, server, season_key, damage, doc) SELECT ?, ?, ?, ?, ?, ?, ? "
      + "WHERE NOT EXISTS (SELECT 1 FROM checks WHERE season_key = ? AND server = ? AND damage = ? AND checked_at > ?) "
      + "AND (SELECT COUNT(*) FROM checks WHERE season_key = ? AND checked_at > ?) < ?",
  )
    .bind(doc.id, doc.checked_at, doc.season, doc.server, seasonKey, doc.damage, JSON.stringify(doc),
      seasonKey, doc.server, doc.damage, since, seasonKey, hourBefore(now), CHECKS_PER_HOUR)
    .run();
  // a repeat or a network over its hourly allowance: nothing stored, and nothing for the page to say
  if (!inserted.meta.changes) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  return json({ id: doc.id }, 201);
}
