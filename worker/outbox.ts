// GET /api/outbox/<key>: the engine's published JSON documents from the R2
// outbox (season.json, history.json, predictions/...), read-only and briefly
// cacheable. Keys are lowercase paths ending in .json; nothing else is served.
//
// GET /api/latest/<server>.json: that server's prediction for the season
// season.json names (predictions/s<n>/<server>.json), so the page needs one
// round of requests instead of two. A distinct URL, not a new document: the
// body and ETag are the prediction's own.
//
// Every read goes through this colo's edge cache (the Workers Cache API) for
// the same MAX_AGE_SECONDS the responses advertise: the bucket sits in eastern
// North America, and an R2 read costs 150-300 ms from Europe and Asia, 304s
// included. Conditional requests are answered here from the cached validators.
import type { WorkerEnv } from "./env";
import { error } from "./http";

const KEY = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\.json$/;
const SERVER = /^(jp|kr|na|sea|tw|gb)$/;
export const MAX_AGE_SECONDS = 30;

/** A published document, or a cached "not published", with what conditional requests are judged by. */
interface Doc {
  body: string;
  etag: string;
  uploaded: number;           // ms
  cache: "hit" | "miss";
}
type Read = Doc | { missing: true; cache: "hit" | "miss" };

// The cache entry's own headers: never sent to a client.
const UPLOADED = "X-Outbox-Uploaded";
const MISSING = "X-Outbox-Missing";

/** The edge cache, where the runtime has one (not on workers.dev, previews or in tests). */
function edgeCache(): Cache | null {
  return typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
}

/** One outbox document: from this colo's cache while it's fresh, else from R2, then cached. */
export async function readOutbox(env: WorkerEnv, ctx: ExecutionContext | undefined, origin: string,
  key: string): Promise<Read> {
  const cache = edgeCache();
  const cacheKey = `${origin}/api/outbox/${key}`;
  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) {
    if (cached.headers.has(MISSING)) return { missing: true, cache: "hit" };
    return { body: await cached.text(), etag: cached.headers.get("ETag") ?? "",
      uploaded: Number(cached.headers.get(UPLOADED)), cache: "hit" };
  }

  const object = await env.OUTBOX.get(key);
  const read: Read = object
    ? { body: await object.text(), etag: object.httpEtag, uploaded: object.uploaded.getTime(), cache: "miss" }
    : { missing: true, cache: "miss" };
  if (cache) {
    const headers: Record<string, string> = { "Cache-Control": `public, max-age=${MAX_AGE_SECONDS}` };
    if ("missing" in read) headers[MISSING] = "1";
    else Object.assign(headers, { ETag: read.etag, [UPLOADED]: String(read.uploaded) });
    const put = cache.put(cacheKey, new Response("missing" in read ? "" : read.body, { headers }));
    if (ctx) ctx.waitUntil(put); else await put;
  }
  return read;
}

export async function handleOutbox(request: Request, env: WorkerEnv, key: string,
  ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method_not_allowed");
  if (!KEY.test(key) || key.includes("..")) return error(400, "bad_key");
  return respond(request, await readOutbox(env, ctx, new URL(request.url).origin, key));
}

export async function handleLatest(request: Request, env: WorkerEnv, server: string,
  ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method_not_allowed");
  if (!SERVER.test(server)) return error(400, "bad_server");
  const origin = new URL(request.url).origin;
  const season = await readOutbox(env, ctx, origin, "season.json");
  if ("missing" in season) return respond(request, season);
  const number = (JSON.parse(season.body) as { season?: unknown }).season;
  if (!Number.isInteger(number)) return error(502, "bad_season");
  return respond(request, await readOutbox(env, ctx, origin, `predictions/s${number}/${server}.json`));
}

function respond(request: Request, read: Read): Response {
  if ("missing" in read) return error(404, "not_found", {}, { "X-Outbox-Cache": read.cache });
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${MAX_AGE_SECONDS}`,
    ETag: read.etag,
    "X-Content-Type-Options": "nosniff",
    "X-Outbox-Cache": read.cache,
  };
  const status = precondition(request.headers, read);
  if (status !== 200) return new Response(null, { status, headers });
  return new Response(request.method === "HEAD" ? null : read.body, { headers });
}

/**
 * 200, or the status a failed precondition gives (RFC 9110 13.2.2): If-Match, then
 * If-Unmodified-Since (412), then If-None-Match, then If-Modified-Since (304). The
 * same evaluation R2's onlyIf did before reads were cached.
 */
function precondition(headers: Headers, doc: Doc): 200 | 304 | 412 {
  const seconds = Math.floor(doc.uploaded / 1000) * 1000;
  const match = headers.get("If-Match");
  if (match !== null) {
    if (!(match.trim() === "*" || tags(match).includes(doc.etag))) return 412;
  } else {
    const since = Date.parse(headers.get("If-Unmodified-Since") ?? "");
    if (!Number.isNaN(since) && seconds > since) return 412;
  }
  const noneMatch = headers.get("If-None-Match");
  if (noneMatch !== null) {
    // weak comparison: Cloudflare weakens the ETag when it compresses the response
    const weak = (tag: string) => tag.replace(/^W\//, "");
    return noneMatch.trim() === "*" || tags(noneMatch).some((tag) => weak(tag) === weak(doc.etag)) ? 304 : 200;
  }
  const since = Date.parse(headers.get("If-Modified-Since") ?? "");
  return !Number.isNaN(since) && seconds <= since ? 304 : 200;
}

const tags = (header: string) => header.split(",").map((tag) => tag.trim());
