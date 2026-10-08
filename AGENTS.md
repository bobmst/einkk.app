<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# einkk.app — project rules

- **This repository is public.** Never commit secrets (`.env*`, keys, tokens), raw player submissions or
  screenshots, or anything from the private engine repository: model code, coefficients, research notes or
  its database.
- The site reads predictions only from the outbox and writes player reports only to the inbox. It never calls
  the engine. See `docs/ARCHITECTURE.md`.
- Player reports are numbers only. Never add image upload or image storage. There is no admin area on this
  site: review tooling belongs to the private engine.
- Show only our own data (forecasts, bands, grading). Never republish data compiled by third parties.
- `contracts/` is the boundary with the engine. Change it only through a pull request, bump `schema_version`
  by semver (`contracts/README.md`), and keep every example valid.
- Player-facing text is in the season survey's five languages (English, 日本語, 한국어, 简体中文,
  繁體中文) plus Español, all in `src/lib/i18n.ts`. Damage is in 0.1B (1e8) units unless a field says
  otherwise; the page shows it as 亿/億/억, or as billions to three decimals in English and Spanish.
- Issues use the templates in `.github/ISSUE_TEMPLATE/`. The triage labels are `needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human` and `wontfix`.
