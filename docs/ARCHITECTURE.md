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

## Open decisions

These are tracked as issues and architecture decision records:

- hosting, and the storage behind the inbox and the outbox;
- where screenshots are read (OCR) and how long they are kept;
- how upstream data sources are credited, and what permission is needed before their data appears on the site;
- the full split of responsibilities between the two repositories.
