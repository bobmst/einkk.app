# Text-review preview (#112)

Shows the real page in every state it can be in, in every language and in light and dark,
from made-up documents, so a text change can be read where players see it.

```bash
npm run states                 # build with the preview pages, then serve them
npm run states -- --no-build   # serve the last build again
```

Then open http://localhost:4173/states: one row per state, one link per language and theme.
Each preview has a bar at the bottom right that walks every page in order (language by language)
and marks it OK or Change; the marks stay in that browser, and the index can copy the list of
pages marked Change. `&post=<error code>` on a preview link makes the fake intake answer Submit
with that error.

- `states.ts`: the states, each a fixture built relative to the moment it opens, plus the keys
  it shows. `docs/text-review/states.md` says why each state shows what it does; keep the two
  together when a state is added.
- `fake-api.ts`: answers the page's `/api/*` requests from a fixture, in the browser.
- `review.ts`: the review order and the marks.
- `src/app/states/page.states.tsx` (the index) and `src/app/states/view/page.states.tsx` (one
  state) are pages only when `STATE_PREVIEW=1` is set at build time (`next.config.ts`).
  `scripts/states.mjs` sets it, then moves the export from `out/` to `out-states/`.

**Never in production.** Without `STATE_PREVIEW=1` (the CI, uat and production builds) the
`*.states.tsx` files are not pages and nothing imports this folder, so neither the routes nor
the fixtures are in `out/`. The preview binds 127.0.0.1 and needs no Worker, outbox or
credentials: every request to `/api/*` is answered in the browser.
