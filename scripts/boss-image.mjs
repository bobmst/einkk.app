// Copy a season's boss art from enikk.app into public/bosses/s<season>.webp.
//
//   npm run boss-image -- 42
//
// enikk.app (a fan project, like this one) agreed to its art being used here;
// the page credits it. Copied, not hot-linked, so we don't spend their bandwidth.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const season = Number(process.argv[2]);
if (!Number.isInteger(season) || season < 1) {
  console.error("usage: npm run boss-image -- <season>");
  process.exit(1);
}

const headers = { "User-Agent": "einkk.app boss-image script (+https://github.com/bobmst/einkk.app)" };
const page = await (await fetch(`https://enikk.app/soloraid/${season}`, { headers })).text();
// the page names it plainly or URL-encoded (/_next/image?url=%2Fbosses%2F...)
const file = page.match(/bosses(?:\/|%2F)(full_[a-z0-9_]+\.png)/i)?.[1];
if (!file) {
  console.error(`No boss image on enikk.app/soloraid/${season} yet.`);
  process.exit(1);
}
const path = `/bosses/${file}`;
const art = Buffer.from(await (await fetch(`https://enikk.app${path}`, { headers })).arrayBuffer());
await mkdir("public/bosses", { recursive: true });
const out = `public/bosses/s${season}.webp`;
await writeFile(out, await sharp(art).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer());
console.log(`${path} -> ${out}`);
