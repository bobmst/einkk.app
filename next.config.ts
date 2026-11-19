import type { NextConfig } from "next";

// The text-review preview (src/preview/README.md, #112): STATE_PREVIEW=1 adds the pages
// named `page.states.tsx` (the state index and the fixture view). `npm run states` builds
// with it and moves the export from out/ to out-states/; uat's deploy builds with it, so
// uat.einkk.app/states has them (.github/workflows/deploy.yml). Without the flag those files
// are not pages at all, so a production build has no such route, and its deploy checks that.
const STATES = process.env.STATE_PREVIEW === "1";

const nextConfig: NextConfig = {
  // Static export (docs/ARCHITECTURE.md, "Hosting"): `next build` writes plain
  // HTML/CSS/JS to out/, which Cloudflare serves as Worker static assets. The
  // live numbers are fetched in the browser, so no server rendering is needed.
  // The template's cacheComponents / partialPrefetching are left off: they are
  // partial prerendering, which `next build` rejects in export mode.
  // Styling is MUI (Emotion, src/app/providers.tsx); no CSS pipeline is needed.
  output: "export",
  ...(STATES ? { pageExtensions: ["states.tsx", "tsx", "ts", "jsx", "js"] } : {}),
};

export default nextConfig;
