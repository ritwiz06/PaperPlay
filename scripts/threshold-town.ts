/**
 * npm run fixture:threshold-town
 *
 * Writes fixtures/worldspecs/kermack-mckendrick-1927.json from scripts/fixtures/threshold-town.ts,
 * where Threshold Town is authored (ADR-0029). With --print, prints it instead, for the test that
 * holds the fixture to its source.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { thresholdTownJson } from "./fixtures/threshold-town.ts";

if (process.argv.includes("--print")) process.stdout.write(thresholdTownJson());
else writeFileSync(join(import.meta.dirname, "..", "fixtures", "worldspecs", "kermack-mckendrick-1927.json"), thresholdTownJson());
