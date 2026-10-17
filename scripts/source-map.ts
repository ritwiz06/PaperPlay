/**
 * A source map's locators, made and checked against a fresh fetch (ADR-0045).
 *
 *   npm run sources:map -- <map.json>     fetches the map's url, reads its text, and writes each
 *                                         claim's section and offsets and the digests
 *   npm run sources:check -- <map.json>   fetches again and checks the bytes, the text and every
 *                                         quote against the map, changing nothing
 *
 * The text is read and thrown away: a source whose licence does not let its text be kept keeps
 * only its claims' short quotes. Calls the network, so it is not part of the gate; its output is
 * kept in the session log.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { SourceMap } from "@paperplay/contracts";
import { extractPdf } from "@paperplay/pipeline/ingest";
import { findQuote } from "@paperplay/pipeline/transcribe";

/** The request carries nothing about the person running it (CLAUDE.md, boundary 9). */
const USER_AGENT = "PaperPlay/0.1 (ASU research prototype; source map check)";
const digest = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const squeeze = (text: string): string => text.replace(/\s+/g, " ").trim();

async function read(url: string): Promise<{ readonly bytes: Uint8Array; readonly text: string; readonly pages: readonly { readonly id: string; readonly title: string; readonly start: number; readonly end: number }[] }> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error(`${url} is not a PDF`);
  const paper = await extractPdf(bytes);
  return { bytes, text: paper.text, pages: paper.sections };
}

async function map(path: string): Promise<void> {
  const before = SourceMap.parse(JSON.parse(readFileSync(path, "utf8")));
  const { bytes, text, pages } = await read(before.url);
  const claims = before.claims.map((claim) => {
    const found = findQuote(text, claim.anchor.quote);
    if (!found) throw new Error(`claim ${claim.id}: its quote is not in the text: "${claim.anchor.quote}"`);
    const page = pages.find((section) => section.start <= found.start && found.start < section.end);
    if (!page) throw new Error(`claim ${claim.id}: no page holds offset ${found.start}`);
    return { ...claim, anchor: { ...claim.anchor, sectionId: page.id, charStart: found.start, charEnd: found.end, quote: squeeze(text.slice(found.start, found.end)) } };
  });
  const after = SourceMap.parse({
    ...before,
    sha256: digest(bytes),
    textSha256: digest(text),
    textLength: text.length,
    manifest: { ...before.manifest, sha256: digest(bytes), accessedAt: new Date().toISOString(), localCopyPermitted: false, sections: pages.map((section) => ({ id: section.id, title: section.title })) },
    claims,
  });
  writeFileSync(path, `${JSON.stringify(after, null, 2)}\n`);
  console.log(`${path}: ${claims.length} claims located in ${before.url} (${bytes.length} bytes, sha256 ${digest(bytes).slice(0, 12)}…, ${text.length} characters of text, not kept)`);
}

async function check(path: string): Promise<boolean> {
  const sourceMap = SourceMap.parse(JSON.parse(readFileSync(path, "utf8")));
  const { bytes, text } = await read(sourceMap.url);
  const lines = [
    `bytes  ${digest(bytes) === sourceMap.sha256 ? "same" : "CHANGED"}  sha256 ${digest(bytes)}`,
    `text   ${digest(text) === sourceMap.textSha256 ? "same" : "CHANGED"}  ${text.length} characters, not kept`,
  ];
  let ok = digest(bytes) === sourceMap.sha256 && digest(text) === sourceMap.textSha256;
  for (const claim of sourceMap.claims) {
    const holds = squeeze(text.slice(claim.anchor.charStart, claim.anchor.charEnd)) === squeeze(claim.anchor.quote);
    ok &&= holds;
    lines.push(`${holds ? "holds " : "MOVED "} ${claim.id.padEnd(24)} ${claim.anchor.sectionId} ${claim.anchor.charStart}–${claim.anchor.charEnd}  "${claim.anchor.quote.length > 70 ? `${claim.anchor.quote.slice(0, 67)}…` : claim.anchor.quote}"`);
  }
  console.log([`${path} against ${sourceMap.url}`, ...lines.map((line) => `  ${line}`), ok ? "every quote is where the map says" : "the map no longer matches its source"].join("\n"));
  return ok;
}

const [command, path] = process.argv.slice(2);
if (!path || (command !== "map" && command !== "check")) {
  console.error("usage: node scripts/source-map.ts map|check <map.json>");
  process.exit(2);
}
if (command === "map") await map(path);
else if (!(await check(path))) process.exit(1);
