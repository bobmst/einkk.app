# Contracts

JSON Schemas (draft 2020-12) for everything that crosses the boundary between this site and the private
engine. This directory is the single source of truth for both sides.

| Schema | Written by | Read by | Version |
|---|---|---|---|
| `prediction.schema.json` | engine (outbox) | site | 0.1.0 (draft) |
| `report.schema.json` | site (inbox) | engine | 0.1.0 (draft) |

`report.schema.json` describes one in-raid player report as the site stores it. It holds numbers
only, with exactly one of `rank_pc` / `rank_n`. The site sets `id`, `submitted_at` and `client`;
`client` carries a salted hash for rate limiting and never an IP address or account.

## Examples and checks

`examples/<schema name>/` holds `valid-*.json` and `invalid-*.json` documents; each invalid one
breaks exactly one rule. `npm test` (also run in CI) checks two things:
- every schema compiles as draft 2020-12 under Ajv's strict mode;
- every example passes (`valid-*`) or fails (`invalid-*`) under `@cfworker/json-schema`, the
  validator the Worker uses at runtime.

## Rules

- Every document carries `schema_version`, and every schema pins it with `const`.
- Versions follow semver:
  - **patch** for wording or description changes;
  - **minor** for new optional fields;
  - **major** for anything that removes or renames a field, makes a field required, or changes its meaning or units.
- A release of the contracts is tagged `contracts-vX.Y.Z`. The engine pins one tag and checks that its
  output validates against it in CI.
- Units are 0.1B (1e8 damage) unless a field says otherwise. Percentiles are raw percentages
  (`3.0` = the top 3%).
- A band always travels with the confidence level it actually certifies and with the method that built it.
