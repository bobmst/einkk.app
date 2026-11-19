// The text-review preview (src/preview/README.md): builds the site with the preview pages
// switched on (STATE_PREVIEW=1, next.config.ts), moves the export to out-states/, then serves it at
// http://localhost:4173/states. `npm run states`; `npm run states -- --no-build` serves the
// last build again. Local only: it binds 127.0.0.1 and needs no Worker or credentials.
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, renameSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "out-states");
const PORT = Number(process.env.PORT ?? 4173);

if (!process.argv.includes("--no-build")) {
  const build = spawnSync("npx", ["next", "build"], {
    cwd: ROOT, stdio: "inherit", shell: true, env: { ...process.env, STATE_PREVIEW: "1" },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  // out/ is what `wrangler deploy` uploads: the preview build never stays there
  rmSync(OUT, { recursive: true, force: true });
  renameSync(join(ROOT, "out"), OUT);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

// the export's file for a path: /states -> states.html, /states/view -> states/view.html
function file(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  if (clean.startsWith("..")) return null;
  for (const candidate of [clean, `${clean}.html`, join(clean, "index.html")]) {
    const full = join(OUT, candidate);
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const found = file(url.pathname === "/" ? "/states" : url.pathname);
  if (!found) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(found)] ?? "application/octet-stream" });
  createReadStream(found).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Text-review preview: http://localhost:${PORT}/states`);
});
