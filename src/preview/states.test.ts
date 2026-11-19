// The preview's fixtures (#112) are documents the engine could publish: each one validates
// against its contract, so a state on the index is one the page can really be in. The two
// states about documents the page can't use are the exceptions, and are checked to fail.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Validator } from "@cfworker/json-schema";
import { describe, expect, it } from "vitest";
import { text } from "@/lib/i18n";
import { STATES } from "./states";

const contract = (name: string) => new Validator(
  JSON.parse(readFileSync(join(__dirname, "..", "..", "contracts", `${name}.schema.json`), "utf8")), "2020-12", false);
const CONTRACTS = { season: contract("season"), prediction: contract("prediction"), history: contract("history"),
  finals: contract("finals"), frame: contract("frame") };
const NOT_VALID = new Set(["page-outdated", "section-failed"]);

function kind(key: string): keyof typeof CONTRACTS | null {
  if (key.endsWith("frame.json")) return "frame";
  if (key.endsWith("season.json")) return "season";
  if (key.endsWith("history.json")) return "history";
  if (key.startsWith("finals/") || key.includes("/finals/")) return "finals";
  if (key.includes("predictions/")) return "prediction";
  return null;
}

const NOW = Date.parse("2026-11-19T12:00:00Z");

describe.each(STATES.map((s) => [s.id, s] as const))("%s", (id, state) => {
  const fixture = state.build(NOW);
  const docs: [string, unknown][] = [];
  if (fixture.history) docs.push(["history.json", fixture.history]);
  if (typeof fixture.now === "object") {
    docs.push(["season.json", fixture.now.season]);
    for (const [server, p] of Object.entries(fixture.now.predictions)) if (p) docs.push([`predictions/${server}`, p]);
    if (fixture.now.finals) docs.push(["finals/now", fixture.now.finals]);
  }
  for (const [key, doc] of Object.entries(fixture.outbox ?? {})) docs.push([key, doc]);

  it("serves documents that follow the contracts", () => {
    const failures = docs.flatMap(([key, doc]) => {
      const k = kind(key);
      if (!k) return [`${key}: no contract`];
      const result = CONTRACTS[k].validate(doc);
      return result.valid ? [] : [`${key}: ${JSON.stringify(result.errors.slice(0, 2))}`];
    });
    if (NOT_VALID.has(id)) expect(failures.length).toBeGreaterThan(0);
    else expect(failures).toEqual([]);
  });

  it("lists only keys the text has", () => {
    const t = text("en") as unknown as Record<string, unknown>;
    for (const key of state.keys) {
      const [top, sub] = key.split(".");
      expect(t[top], key).toBeDefined();
      if (sub) expect((t[top] as Record<string, unknown>)[sub], key).toBeDefined();
    }
  });
});
