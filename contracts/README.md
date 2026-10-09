# Contracts

JSON Schemas (draft 2020-12) for everything that crosses the boundary between this site and the private
engine. This directory is the single source of truth for both sides.

| Schema | Written by | Read by | Version |
|---|---|---|---|
| `prediction.schema.json` | engine (outbox) | site | 0.3.0 (draft): optional nested `bands` (0.2.0) and the `residuals` they come from (0.3.0) |
| `report.schema.json` | site (inbox) | engine | 0.1.0 (draft) |
| `season.schema.json` | engine (outbox) | site | 0.1.0 (draft) |
| `history.schema.json` | engine (outbox) | site | 0.2.0 (draft): the band is optional; `hit: null` without one |

`report.schema.json` describes one in-raid player report as the site stores it. It holds numbers
only, with exactly one of `rank_pc` / `rank_n`. The site sets `id`, `submitted_at` and `client`;
`client` carries a salted hash for rate limiting and never an IP address or account.

`season.schema.json` is the season the site shows: boss, UTC schedule, `state` (upcoming → live →
measuring → closed) and the Tally survey, which is `null` until the form exists. The site links
to the survey only after the raid has ended and while the survey window is open. The schema
accepts only `https://tally.so/` URLs, because the site renders this value as a link.

`history.schema.json` is our track record. Each season and server entry holds one or both of:
- **the forecast of record**, with its band and grading (`error_pct`, `hit`; `null` until graded).
  S15–S20 were posted without a range, so those entries have no band and grade with `hit: null`;
- **the final 3% line, when we measured it ourselves**. The `source` is `manual_collection` (the
  maintainer's own collection from community posts, S14–S34), `survey` (our end-of-season survey)
  or `reports` (in-raid reports to this site). `n` gives the sample size, which is required for
  survey and reports values.

JP's final line is the last official-day value from community posts, copied by hand, so it is
`manual_collection` too. Nothing is taken from another site's compiled data. Legacy bands carry
`method: t_in_sample_legacy` and `level: null`, because they never certified the level they were
labelled with.

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
