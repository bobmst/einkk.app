// Secrets are set in the dashboard or with `wrangler secret put`, never in
// wrangler.jsonc, so `wrangler types` can't see them; they are optional here so
// the intake can answer 503 instead of failing when one is missing.
export interface WorkerEnv extends Env {
  TURNSTILE_SECRET?: string;
  RATE_KEY_SALT?: string;
}
