// GET /api/now.json: everything the page checks again while it is open, in one
// request (#86): season.json, every server's prediction for that season, and from
// the close the season's finals. Not a new document: the Worker puts the engine's
// own documents side by side, read through the same edge cache as /api/outbox
// (outbox.ts), so the contracts in contracts/ stay the only shapes the engine
// publishes. history.json is not in it: it is large, changes once a season, and
// the page reads it once on open.
//
// A prediction carries only the fields the page reads (PAGE_FIELDS): the rest of
// the document (inputs, dq, run_id, ...) stays in /api/outbox for whoever wants it.
//
// One ETag covers the response, derived from the ETags of the documents in it, so
// a page whose copy is current gets a 304 with no body.
import type { WorkerEnv } from "./env";
import { error } from "./http";
import { MAX_AGE_SECONDS, readOutbox } from "./outbox";
import { throughMinute } from "../src/lib/windows";

export const SERVERS = ["jp", "kr", "na", "sea", "tw", "gb"] as const;

/** The prediction fields the page reads (src/lib/outbox.ts Prediction); the rest isn't sent here. */
export const PAGE_FIELDS = ["revision", "issued_at", "season", "server", "state", "prediction", "band", "cells",
  "bands", "residuals", "shadow_nowcast"] as const;

const pick = (doc: Record<string, unknown>) =>
  Object.fromEntries(PAGE_FIELDS.filter((f) => f in doc).map((f) => [f, doc[f]]));

async function tag(parts: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  return `"${[...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

export async function handleNow(request: Request, env: WorkerEnv, ctx?: ExecutionContext,
  now = Date.now()): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method_not_allowed");
  const origin = new URL(request.url).origin;
  const seasonRead = await readOutbox(env, ctx, origin, "season.json");
  if ("missing" in seasonRead) return error(404, "not_found", {}, { "X-Outbox-Cache": seasonRead.cache });
  const season = JSON.parse(seasonRead.body) as { season?: unknown; ends_at?: string | null };
  if (!Number.isInteger(season.season)) return error(502, "bad_season");
  const number = season.season as number;
  const ended = Boolean(season.ends_at) && now >= throughMinute(season.ends_at as string);

  const [predictions, finals] = await Promise.all([
    Promise.all(SERVERS.map((s) => readOutbox(env, ctx, origin, `predictions/s${number}/${s}.json`))),
    ended ? readOutbox(env, ctx, origin, `finals/s${number}.json`) : null,
  ]);
  const reads = [seasonRead, ...predictions, ...(finals ? [finals] : [])];
  const etag = await tag([String(ended), ...reads.map((r) => ("missing" in r ? "-" : r.etag))]);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${MAX_AGE_SECONDS}`,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "X-Outbox-Cache": reads.some((r) => r.cache === "miss") ? "miss" : reads.some((r) => r.cache === "stale") ? "stale" : "hit",
  };
  const noneMatch = request.headers.get("If-None-Match");
  // weak comparison: Cloudflare weakens the ETag when it compresses the response
  const weak = (t: string) => t.trim().replace(/^W\//, "");
  if (noneMatch !== null && (noneMatch.trim() === "*" || noneMatch.split(",").some((t) => weak(t) === etag))) {
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") return new Response(null, { headers });

  const body: Record<string, unknown> = {
    season: JSON.parse(seasonRead.body),
    predictions: Object.fromEntries(SERVERS.map((s, i) => {
      const r = predictions[i];
      return [s, "missing" in r ? null : pick(JSON.parse(r.body) as Record<string, unknown>)];
    })),
  };
  if (finals) body.finals = "missing" in finals ? null : JSON.parse(finals.body);
  return new Response(JSON.stringify(body), { headers });
}
