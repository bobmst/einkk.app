// Render the link-preview card (#120) to src/app/opengraph-image.png:
//
//   npm run share-image
//
// Next's file convention turns that PNG, and opengraph-image.alt.txt beside it, into the
// og:image, og:image:width/height/type/alt and twitter:image tags of every page. The image is
// static, so it carries no number that would go stale: the name, one line, the six servers, and
// a made-up forecast curve with its band. It is drawn on the site's dark card colours so it reads
// the same on light and dark apps. The text is set in Roboto (the site's font) where it is
// installed, else a system sans; the PNG is committed, so the build never needs the font.
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const W = 1200;
const H = 630;
const ACCENT = "#4da3ff";            // the dark theme's primary (src/app/providers.tsx)
const FONT = "Roboto, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

// the six servers, in the page's tab order (src/lib/i18n.ts SERVER_NAMES.en)
const servers = [["JP", 132], ["KR", 132], ["GLOBAL", 218], ["NA", 132], ["SEA", 156], ["TW-HK", 200]];
const GAP = 18;
let x = 80;
const chips = servers.map(([name, w]) => {
  const chip = `<rect x="${x}" y="470" width="${w}" height="76" rx="38" fill="${ACCENT}" fill-opacity="0.14" stroke="${ACCENT}" stroke-opacity="0.75" stroke-width="3"/>
    <text x="${x + w / 2}" y="520" text-anchor="middle" font-size="38" font-weight="700" fill="#e8f2ff">${name}</text>`;
  x += w + GAP;
  return chip;
}).join("\n    ");

// a made-up curve (damage falling with rank), the range around it as one wide soft stroke, and a
// dashed line across: the shape of the page's chart, none of its numbers. It stays right of the
// name and above the chips, so no text sits on it.
const curve = "M 800 84 C 870 84, 905 150, 965 210 S 1100 318, 1160 326";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1014"/><stop offset="1" stop-color="#14263a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.16" r="0.55">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.34"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <path d="${curve}" fill="none" stroke="${ACCENT}" stroke-opacity="0.16" stroke-width="92"/>
  <line x1="800" y1="236" x2="1160" y2="236" stroke="#e8f2ff" stroke-opacity="0.35" stroke-width="3" stroke-dasharray="14 12"/>
  <path d="${curve}" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" stroke-opacity="0.95"/>
  <text x="80" y="208" font-family="${FONT}" font-size="148" font-weight="700" fill="#ffffff" letter-spacing="-2">einkk.app</text>
  <text x="84" y="302" font-family="${FONT}" font-size="58" font-weight="500" fill="#cfe3fb">NIKKE Solo Raid border forecasts</text>
  <text x="84" y="398" font-family="${FONT}" font-size="40" font-weight="400" fill="${ACCENT}">One forecast for every server, with honest ranges</text>
  <g font-family="${FONT}">
    ${chips}
  </g>
</svg>`;

await writeFile(new URL("../src/app/opengraph-image.png", import.meta.url),
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toBuffer());
console.log(`wrote src/app/opengraph-image.png (${W}x${H})`);
