import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export (docs/ARCHITECTURE.md, "Hosting"): `next build` writes plain
  // HTML/CSS/JS to out/, which Cloudflare serves as Worker static assets. The
  // live numbers are fetched in the browser, so no server rendering is needed.
  // The template's cacheComponents / partialPrefetching are left off: they are
  // partial prerendering, which `next build` rejects in export mode.
  // Styling is MUI (Emotion, src/app/providers.tsx); no CSS pipeline is needed.
  output: "export",
};

export default nextConfig;
