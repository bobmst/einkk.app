// Worker entry for einkk.app (docs/ARCHITECTURE.md, "Hosting").
//
// The static export in out/ is served by the assets layer without running this
// script; only /api/* reaches it (run_worker_first in wrangler.jsonc), so page
// views never count against the Worker request quota.
//
// For now it answers a health check. Report intake (POST /api/reports, needs
// contracts/report.schema.json) and the outbox read API come next.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, inbox: Boolean(env.INBOX), outbox: Boolean(env.OUTBOX) });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
