// GET /api/outbox/<key>: the engine's published JSON documents from the R2
// outbox (season.json, history.json, predictions/...), read-only and briefly
// cacheable. Keys are lowercase paths ending in .json; nothing else is served.
import type { WorkerEnv } from "./env";
import { error } from "./http";

const KEY = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\.json$/;
export const MAX_AGE_SECONDS = 30;

export async function handleOutbox(request: Request, env: WorkerEnv, key: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method_not_allowed");
  if (!KEY.test(key) || key.includes("..")) return error(400, "bad_key");

  // onlyIf takes the request's conditional headers: a matching If-None-Match
  // comes back as metadata without a body, which is a 304.
  const object = await env.OUTBOX.get(key, { onlyIf: request.headers });
  if (!object) return error(404, "not_found");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${MAX_AGE_SECONDS}`,
    ETag: object.httpEtag,
  };
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
