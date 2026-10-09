import { describe, expect, it } from "vitest";
import type { WorkerEnv } from "./env";
import worker from "./index";

const env = {
  INBOX: {},
  OUTBOX: {},
  TURNSTILE_SECRET: "secret-never-returned",
  RATE_KEY_SALT: "salt-never-returned",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  SITE_MODE: "rehearsal",
} as unknown as WorkerEnv;

describe("GET /api/health", () => {
  it("tells the page its mode and Turnstile site key, and never a secret", async () => {
    const response = await worker.fetch(new Request("https://einkk.example/api/health"), env);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      inbox: true,
      outbox: true,
      intake: true,
      mode: "rehearsal",
      turnstile_site_key: "1x00000000000000000000AA",
    });
    expect(JSON.stringify(body)).not.toMatch(/never-returned/);
  });
});
