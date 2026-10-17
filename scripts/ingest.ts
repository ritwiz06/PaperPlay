/**
 * npm run ingest -- <source>...
 *
 * Fetches each source, reads it with the restricted readers, and records it in the source register,
 * fixtures/sources/register.json (every-paper.md §3.1). A source's text is kept, as
 * fixtures/sources/<sourceId>.json, only when its licence allows adapted copies (CC BY, CC BY-SA,
 * CC0 or the public domain); otherwise only its register entry is. Calls no model.
 *
 *   arxiv:<id>v<n>   an arXiv paper's LaTeX source at that version
 *   pmc:PMC<n>       a PubMed Central article's JATS, through E-utilities
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SourceRegister } from "@paperplay/contracts";
import { fetchArxiv, fetchPmc, registerAndText, type Fetch } from "@paperplay/pipeline/ingest";
import { outboundFetch } from "../apps/api/src/contact.ts";

const SOURCES = join(import.meta.dirname, "..", "fixtures", "sources");
const REGISTER = join(SOURCES, "register.json");
const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error("usage: npm run ingest -- arxiv:<id>v<n> | pmc:PMC<n> ...");
  process.exit(2);
}

const register = existsSync(REGISTER) ? SourceRegister.parse(JSON.parse(readFileSync(REGISTER, "utf8"))) : { schemaVersion: "sourceregister/1" as const, sources: [] };
const network: Fetch = outboundFetch();
let failed = false;
for (const raw of wanted) {
  try {
    const fetched = raw.startsWith("arxiv:") ? await fetchArxiv(network, raw.slice("arxiv:".length)) : await fetchPmc(network, raw);
    const { entry, text } = registerAndText(fetched, new Date().toISOString());
    register.sources = [...register.sources.filter((source) => source.sourceId !== entry.sourceId), entry].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    if (entry.textKept) writeFileSync(join(SOURCES, `${entry.sourceId}.json`), `${JSON.stringify(text, null, 2)}\n`);
    console.log(
      `${entry.sourceId}: "${entry.title}" (${entry.licence}${entry.textKept ? ", text kept" : ", text not kept"}): ${text.sections.length} sections, ${text.equations.length} display equations, ${text.text.length} characters`,
    );
  } catch (error) {
    failed = true;
    console.error(`${raw}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
writeFileSync(REGISTER, `${JSON.stringify(SourceRegister.parse(register), null, 2)}\n`);
if (failed) process.exit(1);
