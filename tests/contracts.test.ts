// Contract checks (contracts/README.md): every schema is a valid draft 2020-12
// schema, and every example under contracts/examples/<name>/ validates (valid-*)
// or fails (invalid-*) against it. Examples are checked with @cfworker/json-schema,
// the validator the Worker uses at runtime; Ajv only meta-validates the schemas.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Validator } from "@cfworker/json-schema";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "contracts");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const schemas = readdirSync(dir).filter((f) => f.endsWith(".schema.json"));

describe.each(schemas)("%s", (file) => {
  const schema = read(join(dir, file));
  const name = file.replace(".schema.json", "");
  const examplesDir = join(dir, "examples", name);
  const examples = existsSync(examplesDir) ? readdirSync(examplesDir).filter((f) => f.endsWith(".json")) : [];

  it("is a valid draft 2020-12 schema with no unknown keywords", () => {
    // strictRequired is off: `oneOf: [{required: [a]}, {required: [b]}]` names properties
    // defined one level up, which is standard JSON Schema but trips that Ajv-only check.
    const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, validateFormats: false });
    expect(() => ajv.compile(schema)).not.toThrow();
  });

  it("pins schema_version with const", () => {
    expect(schema.properties.schema_version.const).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("ships at least one valid example", () => {
    expect(examples.some((f) => f.startsWith("valid-"))).toBe(true);
  });

  const validator = new Validator(schema, "2020-12", false);
  it.each(examples)("%s", (example) => {
    const result = validator.validate(read(join(examplesDir, example)));
    expect(result.valid, JSON.stringify(result.errors.slice(0, 3))).toBe(example.startsWith("valid-"));
  });
});
