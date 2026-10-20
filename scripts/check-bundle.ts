/**
 * node scripts/check-bundle.ts [folder]
 *
 * Runs after every production build (`npm run build`), so the gate's build step fails when the
 * client bundle holds a secret (CLAUDE.md boundary 7, ADR-0030). It reads every file the build
 * wrote (apps/web/dist by default) and, when apps/api/.env is present, the values of its keys,
 * which it never prints. Exits non-zero, naming each file and rule, if anything is found.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { findSecrets, secretValues, type BundleFile } from "./bundle/secrets.ts";

const root = join(import.meta.dirname, "..");
const folder = process.argv[2] ?? join(root, "apps", "web", "dist");

/** Every text file under a folder: the bundle's scripts, styles, HTML and maps. */
function textFiles(dir: string): BundleFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return textFiles(path);
    return /\.(js|mjs|css|html|map|json|txt|webmanifest)$/.test(name) ? [{ name: relative(folder, path), text: readFileSync(path, "utf8") }] : [];
  });
}

if (!existsSync(folder)) {
  console.error(`check-bundle: there is no build at ${folder}`);
  process.exit(1);
}
const files = textFiles(folder);
const envFile = join(root, "apps", "api", ".env");
const values = existsSync(envFile) ? secretValues(readFileSync(envFile, "utf8")) : [];
const findings = findSecrets(files, values);
if (findings.length > 0) {
  console.error("check-bundle: the client bundle holds what it must never hold:");
  for (const finding of findings) console.error(`  ${finding.file}: ${finding.rule}`);
  process.exit(1);
}
console.log(`check-bundle: ${files.length} files clean of keys and key variables${values.length > 0 ? `, and of ${values.length} value${values.length === 1 ? "" : "s"} from apps/api/.env` : ""}.`);
