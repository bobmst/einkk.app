// Worker entry for einkk.app (docs/ARCHITECTURE.md, "Hosting").
//
// The static export in out/ is served by the assets layer without running this
// script; only /api/* reaches it (run_worker_first in wrangler.jsonc), so page
// views never count against the Worker request quota.
//
//   GET  /api/health          bindings and intake configuration, no secrets
//   POST /api/reports         in-raid player report -> D1 inbox (reports.ts)
//   POST /api/finals          post-raid final result -> D1 final_reports (finals.ts)
//   GET  /api/outbox/<key>    published engine JSON from R2 (outbox.ts)
//   GET  /api/latest/<server>.json   that server's prediction for the current season (outbox.ts)
import type { WorkerEnv } from "./env";
import { error } from "./http";
import { handleFinal } from "./finals";
import { handleLatest, handleOutbox } from "./outbox";
import { handleReport } from "./reports";

const OUTBOX_PREFIX = "/api/outbox/";
const LATEST = /^\/api\/latest\/([^/]+)\.json$/;

export default {
  async fetch(request: Request, env: WorkerEnv, ctx?: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      return Response.json(
        {
          ok: true,
          inbox: Boolean(env.INBOX),
          outbox: Boolean(env.OUTBOX),
          intake: Boolean(env.TURNSTILE_SECRET && env.RATE_KEY_SALT),
          // public by design: the page needs both (banner, Turnstile widget)
          mode: env.SITE_MODE,
          turnstile_site_key: env.TURNSTILE_SITE_KEY,
        },
        { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
      );
    }
    if (pathname === "/api/reports") return handleReport(request, env);
    if (pathname === "/api/finals") return handleFinal(request, env);
    if (pathname.startsWith(OUTBOX_PREFIX)) {
      return handleOutbox(request, env, pathname.slice(OUTBOX_PREFIX.length), ctx);
    }
    const latest = LATEST.exec(pathname);
    if (latest) return handleLatest(request, env, latest[1], ctx);
    return error(404, "not_found");
  },
} satisfies ExportedHandler<WorkerEnv>;
