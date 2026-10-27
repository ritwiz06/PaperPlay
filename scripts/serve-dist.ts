/**
 * node scripts/serve-dist.ts [--port 4318]
 *
 * Serves the production build (apps/web/dist) the way Vercel will, from vercel.json: every
 * matching header rule's headers, files first, then the rewrites. The browser tests run the
 * built app behind it, so the Content-Security-Policy the first deploy sends is the one tested
 * (ADR-0017). Only the simple patterns vercel.json uses are understood; anything else fails.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

interface Rule {
  readonly source: string;
}
interface VercelConfig {
  readonly outputDirectory: string;
  readonly rewrites: readonly (Rule & { readonly destination: string })[];
  readonly headers: readonly (Rule & { readonly headers: readonly { readonly key: string; readonly value: string }[] })[];
}

const root = join(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as VercelConfig;
const dist = join(root, config.outputDirectory);

/**
 * vercel.json's sources here are plain paths with "(.*)" groups, or "/((?!path).*)" for every path
 * but one (the sandbox's frame, which has headers of its own), and each reads as a regular
 * expression as it stands.
 */
export function matcher(source: string): RegExp {
  if (!/^\/[\w/.-]*(\(\.\*\))?$/.test(source) && !/^\/\(\(\?![\w/\\.-]+\)\.\*\)$/.test(source)) throw new Error(`serve-dist does not understand the source pattern ${source}`);
  return new RegExp(`^${source}$`);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function fileFor(path: string): string | null {
  const resolved = normalize(join(dist, decodeURIComponent(path)));
  if (!resolved.startsWith(dist + sep) && resolved !== dist) return null;
  return existsSync(resolved) && statSync(resolved).isFile() ? resolved : null;
}

const port = Number(process.argv[process.argv.indexOf("--port") + 1] ?? 4318) || 4318;
if (!existsSync(join(dist, "index.html"))) throw new Error(`no build at ${dist}: run npm run build first`);

createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  for (const rule of config.headers) if (matcher(rule.source).test(path)) for (const { key, value } of rule.headers) response.setHeader(key, value);
  let file = fileFor(path);
  if (!file) {
    const rewrite = config.rewrites.find((rule) => matcher(rule.source).test(path));
    file = rewrite ? fileFor(rewrite.destination) : null;
  }
  if (!file) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }
  response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  response.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`serving ${dist} as Vercel would, at http://127.0.0.1:${port}`));
