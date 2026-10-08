# Architecture

einkk.app is split across two repositories that never share code.

| | **einkk.app** (this repo, public) | **engine** (private) |
|---|---|---|
| Language | TypeScript / Next.js | Python |
| Owns | the website, player tools, the public read API, intake of player reports (validation and anti-abuse), and `contracts/` | data collection, data quality, forecasting models, scheduled runs, publishing predictions, and grading past seasons |
| Never contains | secrets, raw player submissions or screenshots, model code or coefficients | — |

## The boundary

```
engine ── writes ──> outbox: one versioned prediction document per server and update
                     (contracts/prediction.schema.json) ── read by ──> site
site ── writes ──> inbox: validated, rate-limited player reports ── read by ──> engine
```

- The site never calls the engine, and the engine never serves traffic. The two meet only at the inbox and
  the outbox.
- `contracts/` is the single source of truth for both sides. Changes go through a pull request here and
  follow semantic versioning: a breaking change is a major bump. The engine pins a tagged contract version
  and checks compatibility in its own CI.
- A prediction always carries the band's real confidence level and method, so a band can never be shown at
  a level it was not built for.

## Decided (2026-10-07)

- **No admin on the site.** Data-quality review, the quarantine queue and publish approval are internal
  tools of the private engine. The site has no admin routes.
- **In-raid reports are numbers only.** Players enter their server, their rank (a percentage or a number)
  and their damage. The site never accepts or stores images.
  - The form shows the value back formatted (for example "223.16 亿") so the player can confirm it.
  - It warns softly about implausible values.
  - The engine runs the statistical checks.
- **Two kinds of player data.**
  - In-raid reports come through this site.
  - The end-of-season survey stays on Tally. After the raid ends, the site links to it, using the survey
    link and window published in the season document.
- **Only our own data is shown.** That means our forecasts, bands and grading. We don't republish data that
  third parties compiled.

## Contracts

| Contract | Direction | Status |
|---|---|---|
| `prediction.schema.json` | engine → site | 0.1.0 (draft) |
| `season.schema.json` | engine → site | 0.1.0 (draft) |
| `history.schema.json` | engine → site | 0.1.0 (draft) |
| `report.schema.json` | site → engine | 0.1.0 (draft) |

## API

All API routes are served by the Worker under `/api/*` (`worker/`). Responses are JSON, and errors look like
`{"error": "<code>", ...}`.

| Route | What it does |
|---|---|
| `GET /api/health` | Reports which bindings exist and whether intake is configured. Never returns secrets. |
| `POST /api/reports` | Accepts one in-raid report. The body holds the player fields of `report.schema.json` plus `turnstile_token`. The Worker sets `id`, `submitted_at` and `client`. Responses: `201 {"id"}`, or `400` (`bad_json`, `unknown_fields`, `invalid_report`), `403` (`cross_origin`, `turnstile_failed`), `413`, `415`, `429` (`rate_limited`), `503` (`intake_not_configured`). |
| `GET /api/outbox/<key>.json` | Serves a document the engine published to R2, e.g. `season.json`. Keys are lowercase paths. Responses are cached for 30 seconds and carry an ETag, so a matching `If-None-Match` gets a `304`. |

- **Order of the intake checks:** request shape first, then the contract, then the Turnstile call, then the rate limit, then the insert. Nothing is stored unless every step passes.
- **Rate limiting:** at most 10 reports per hour per key. The key is SHA-256(`RATE_KEY_SALT`, UTC date, client address). Because the date is in the key, reports can't be linked across days, and the address is never stored.
- **Inbox schema:** the D1 table lives in `migrations/`. Apply new migrations with `npx wrangler d1 migrations apply einkk-inbox --remote`.
- **Secrets:** the Worker needs `TURNSTILE_SECRET` and `RATE_KEY_SALT`, set as Worker secrets (Production only).

## Hosting (free tiers)

| Piece | Where |
|---|---|
| Site | One Cloudflare Worker (`wrangler.jsonc`, named `einkk-app`) serves the Next.js static export in `out/` as static assets. Workers Builds deploys it on every push to `main`. The live numbers are fetched in the browser, so no rebuild is needed when they change. |
| Report intake and read API | The same Worker, under `/api/*`. Intake does Turnstile, rate limiting and validation against `contracts/`. The read API serves the outbox. Being on the same origin means no CORS. |
| Inbox | Cloudflare D1 |
| Outbox | Cloudflare R2 |
| Domain | `einkk.app` (planned); `einkk-app.<account>.workers.dev` until then |
| Previews | Every branch except `main` gets a Worker Preview (`wrangler preview`) bound to `einkk-inbox-dev` and `einkk-outbox-dev`, never the production inbox or outbox. Turnstile runs on its always-pass test keys there, and the preview secrets sit on the shared Preview base config. |

A static export keeps the site independent of server-side Next.js features. Next.js 16 is not yet officially
supported by the Workers adapters, and partial prerendering (`cacheComponents`) cannot be used in export mode.

## Open decisions

- How game data such as boss names and elements is credited on the site.
