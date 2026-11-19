# The page's states and the text each one shows

Every state the page can be in, read off the code that picks what to render
(`src/app/dashboard.tsx`, `season-card.tsx`, `server-view.tsx`, `slice.tsx`, `finals-view.tsx`,
`report-form.tsx`, `track-record.tsx`), with the `src/lib/i18n.ts` keys each one puts on the page.
A key changed in `i18n.ts` can be checked in every state listed against it.

Each state has a fixture of the same name (`src/preview/states.ts`) that the local preview index
renders in every language and in light and dark (see "Preview" below).

## On every page

Header and footer, in every state: `tagline`, `language`, `theme`, the footer links `bossArt`,
`ikkenLink`, `krFinalsLink`, `feedback`, and `notice`. `yourServer` is the server tabs' label
for screen readers, present whenever a season is shown.

## States

| State | When (code path) | Keys shown |
|---|---|---|
| `first-load` | First visit, nothing saved, the first load still running: skeletons only (`!data && !failed`). | the header and footer only |
| `load-failed` | First visit, the first load failed (`failed && !data`). | `loadFailed` |
| `returning-updating` | A returning visit: the last visit's data, while this visit's load runs (`stale && !failed`). Data as in `live-day3`. | `updating`, then the `live-day3` keys |
| `returning-failed` | A returning visit whose load failed (`failed && data`). | `staleData`, then the `live-day3` keys |
| `nothing-published` | No season document (`data && !season`); history still shown. | `nothing`, track record keys |
| `page-outdated` | A document from a newer contract major was set aside (`data.outdated`); here the followed forecast. | `pageOutdated`, `reload`, `noForecast`, season card (live) |
| `section-failed` | One card throws while drawing (`Section`); here the forecast. | `sectionFailed`, `reload` |
| `rehearsal-frame` | uat or a preview (`health.mode === "rehearsal"`) opened with `?frame=` (or `?at=`): the clock is frozen. | `rehearsal`, `frozen`, `reportFrozen`, plus the live keys |
| `upcoming-undated` | Season published, dates not known (`starts_at`/`ends_at` null). | `states.upcoming`, `season`, `weakness`, `datesTba`, `report`, `reportClosed` |
| `upcoming-dated` | Dated, before the start, a pre-raid forecast out; the season before still takes final results (`previous`). | `states.upcoming`, `startsIn`, `starts`, `ends`, `timeNote`, forecast keys (`forecastTitle`, `raidDay`, `updated`), distribution keys, `earlyNote`, `report`, `reportClosed`, previous season's card: `finalChip`, `finalTitle`, `finalIntro`, `finalOrSurvey`, form keys, track record keys |
| `live-day1` | Live, early: no daily line yet (`known_days` 0); the checker's `rankAsk` shows after typing a damage. | `states.live`, `endsIn`, `starts`, `ends`, `timeNote`, forecast keys, `report` (button), distribution keys, `earlyNote`, `rankAsk`, `rankAskButton` (after typing a damage), report form keys |
| `live-day3` | Live, mid-raid; a damage reported earlier this season is remembered (#98); a long track record. | as `live-day1` (`earlyNote` shows until three daily lines are in), plus `rereport`, `rereportUse`, `rereportDismiss`, track record keys: `history`, `seasonCol`, `histForecast`, `error`, `histFinal`, `hit`, `miss`, `noRange`, `pending`, `noFinal`, `histNote`, `histEstimate`, `legacy` |
| `live-no-forecast` | Live, nothing published for this server, and the report intake is off (`health.intake` false). | `noForecast`, `reportUnavailable` |
| `closed-no-finals` | The raid has closed, a forecast exists but no final-results document yet. | `states.measuring`, `distAfterClose`, `survey` (season card, survey open), `finalChip`, `finalTitle`, `finalIntro`, `finalOrSurvey`, form keys |
| `closed-no-forecast` | Closed, no forecast was published for this server, no final-results document. | `noForecastEnded`, final form keys |
| `closed-collecting` | Closed, final results coming in, before they settle (non-JP server). | `finalsTitle`, `finalsCollecting`, `finalsNear3`, `finalsReveal`, final form keys |
| `closed-reveal-soon` | Past the settle time but the document isn't settled yet; nobody on this server sent a result. | `finalsTitle`, `finalsNone`, `finalsRevealSoon` |
| `settled-confirmed` | Settled, the server's line confirmed by results near 3%, with the curve. | `finalsTitle`, `finalsFrom`, `finalsForecast`, `finalsError` (inside), `finalsCurveTitle`, `topPct`, `finalsPoints`, `tier`, `damage`, `estimated`, track record (this season's row selected) |
| `settled-estimate` | Settled, the line is an estimate (too few results near 3%). | `finalsTitle`, `finalsFrom`, `finalsUnconfirmed`, `histEstimate` |
| `settled-jp` | Settled, JP. | `finalsTitle`, `finalsJp`, `finalsForecast`, `finalsError` (outside), curve keys |
| `settled-no-results` | Settled, no results from this server. | `finalsTitle`, `finalsNone` |
| `ended` | After the final-results window (`closed`): no forms. | `states.closed`, finals keys as `settled-confirmed` |

## Keys reached by using the page

These show in the states above once the player does something, so the preview leaves them to the
reviewer's clicks:

- **Report form** (`live-day1`, `live-day3`; the final form in the `closed-*` and `settled-*`
  states): `server`, `damageLabel`, `damageHelp`, `digitsCheck` (after typing a damage),
  `roundWarn` (a damage ending in 000), `rankDisplay`, `rankDisplayHelp`, `pctLabel` / `pctHelp`
  (pick %), `pctLowWarn` (a % under 0.1), `numLabel` / `numHelp` (pick #), `readAtNow`,
  `readAtChange`, `readAt`, `readAtFuture` (a read time in the future), `next`; the review page:
  `reviewTitle`, `rank`, `digitsLow` / `digitsHigh` (a damage a digit off for its rank),
  `reviewNote`, `back`, `submit`, `sending`; then `sent` / `finalSent` and `another`.
- **Errors after Submit**: `errors.*`. The preview's fake API answers every report with success;
  add `&post=<code>` (`invalid_report`, `turnstile_failed`, `rate_limited`, `closed`,
  `intake_not_configured`, `other`) to a preview link to see that error instead.
- **Damage checker** (the distribution card): `calcTitle`, `calcPlaceholder`, `calcResult` /
  `calcAbove` / `calcBelow`, `you`, `sliceTitle`, `sliceLine`, `chance`, `tierChance`,
  `range` / `rangeUncertified`, `forecastLine` (the chart's tooltip), `bandsLegend`.

## Not reachable from the preview

- The forecast slot's `loadFailed` after switching servers in a frame (a frame's forecasts load by
  key; only a failed request shows it).
- `reportUnavailable` when the Turnstile script fails to load.

## Preview

`npm run states` builds the site with the preview pages switched on and serves it at
http://localhost:4173/states (see `src/preview/README.md`); uat has the same pages at
https://uat.einkk.app/states. Nothing of it is in the production build: the pages exist only
when `STATE_PREVIEW=1` is set at build time, and only uat's deploy sets it.
