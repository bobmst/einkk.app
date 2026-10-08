// API responses are JSON and never cached unless a handler says otherwise.
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function error(status: number, code: string, detail: Record<string, unknown> = {}): Response {
  return json({ error: code, ...detail }, status);
}
