// Worker entry for einkk.app (docs/ARCHITECTURE.md, "Hosting").
//
// The static export in out/ is served by the assets layer without running this
// script; only /api/* reaches it (run_worker_first in wrangler.jsonc), so page
// views never count against the Worker request quota.
//
//   GET  /api/health          bindings and intake configuration, no secrets
//   POST /api/reports         in-raid player report -> D1 inbox (reports.ts)
//   GET  /api/outbox/<key>    published engine JSON from R2 (outbox.ts)
import type { WorkerEnv } from "./env";
import { error } from "./http";
import { handleOutbox } from "./outbox";
import { handleReport } from "./reports";

const OUTBOX_PREFIX = "/api/outbox/";

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
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
    if (pathname.startsWith(OUTBOX_PREFIX)) {
      return handleOutbox(request, env, pathname.slice(OUTBOX_PREFIX.length));
    }
    return error(404, "not_found");
  },
} satisfies ExportedHandler<WorkerEnv>;
