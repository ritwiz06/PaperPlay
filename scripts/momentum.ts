/**
 * npm run fixture:momentum
 *
 * Writes fixtures/worldspecs/sutskever-2013-momentum.json from scripts/fixtures/momentum.ts, where
 * the momentum world is authored (ADR-0047). With --print, prints it instead, for the test that
 * holds the fixture to its source.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { momentumJson } from "./fixtures/momentum.ts";

if (process.argv.includes("--print")) process.stdout.write(momentumJson());
else writeFileSync(join(import.meta.dirname, "..", "fixtures", "worldspecs", "sutskever-2013-momentum.json"), momentumJson());
