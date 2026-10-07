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
| `season.schema.json` | engine → site | planned: season, boss, element, dates, state, survey link and window |
| `history.schema.json` | engine → site | planned: our past forecasts, bands and grading |
| `report.schema.json` | site → engine | planned: server, season, rank (percentage or number), damage, timestamps |

## Hosting (free tiers)

| Piece | Where |
|---|---|
| Site | One Cloudflare Worker (`wrangler.jsonc`, named `einkk-app`) serves the Next.js static export in `out/` as static assets. Workers Builds deploys it on every push to `main`. The live numbers are fetched in the browser, so no rebuild is needed when they change. |
| Report intake and read API | The same Worker, under `/api/*`. Intake does Turnstile, rate limiting and validation against `contracts/`. The read API serves the outbox. Being on the same origin means no CORS. |
| Inbox | Cloudflare D1 |
| Outbox | Cloudflare R2 |
| Domain | `einkk.app` (planned); `einkk-app.<account>.workers.dev` until then |

A static export keeps the site independent of server-side Next.js features. Next.js 16 is not yet officially
supported by the Workers adapters, and partial prerendering (`cacheComponents`) cannot be used in export mode.

## Open decisions

- How game data such as boss names and elements is credited on the site.
