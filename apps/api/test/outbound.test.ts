import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fetchArxiv, fetchArxivAbstract, fetchPmc, withContact, type Fetch } from "@paperplay/pipeline/ingest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readContact } from "../src/contact.ts";
import { voyagerClient } from "../src/models/voyager.ts";

// No personal data in an outbound request unless the owner opted in (ADR-0039): an API that asks
// for a contact gets PAPERPLAY_CONTACT_EMAIL from apps/api/.env, unset by default. Every request
// here goes to a fake network, which records it.

const RECORD = "<OAI-PMH><GetRecord><record><metadata><arXiv><id>2101.00001</id><created>2021-01-04</created><title>A small SIR model</title><categories>q-bio.PE</categories><license>http://creativecommons.org/licenses/by/4.0/</license></arXiv></metadata></record></GetRecord></OAI-PMH>";
const ADDRESS = /[^\s@<>()"]+@[^\s@<>()"]+|mailto|%40/i;

/** A network that answers arXiv's record and nothing else, and records every request it is sent. */
function recordingNetwork(): { readonly network: Fetch; readonly sent: { readonly url: string; readonly headers: Readonly<Record<string, string>> }[] } {
  const sent: { url: string; headers: Readonly<Record<string, string>> }[] = [];
  const network: Fetch = (url, init) => {
    sent.push({ url, headers: init?.headers ?? {} });
    const body = url.startsWith("https://export.arxiv.org/oai2") ? RECORD : null;
    return Promise.resolve({ ok: body !== null, status: body === null ? 404 : 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body ?? "").buffer), text: () => Promise.resolve(body ?? "") });
  };
  return { network, sent };
}

/** Every source route's requests: arXiv's record and source, its abstract, and PubMed Central's E-utilities. */
async function fetchEverything(network: Fetch): Promise<void> {
  await fetchArxiv(network, "2101.00001v1").catch(() => undefined);
  await fetchArxivAbstract(network, "2101.00001");
  await fetchPmc(network, "PMC1234567").catch(() => undefined);
}

describe("[R09] outbound requests", () => {
  let folder: string;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "paperplay-contact-"));
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));
  const env = (text: string): string => {
    const file = join(folder, ".env");
    writeFileSync(file, text);
    return file;
  };

  it("read no contact address unless the owner set one, and refuse one that is not an address", () => {
    expect(readContact(join(folder, "missing.env"))).toBeNull();
    expect(readContact(env("VOYAGER_API_KEY=sk_test\n"))).toBeNull();
    expect(readContact(env("VOYAGER_API_KEY=sk_test\nPAPERPLAY_CONTACT_EMAIL=\n"))).toBeNull();
    expect(readContact(env('PAPERPLAY_CONTACT_EMAIL="owner@example.edu"\n'))).toBe("owner@example.edu");
    expect(() => readContact(env("PAPERPLAY_CONTACT_EMAIL=not an address\n"))).toThrow(/is not an email address; it is sent to no one/);
  });

  it("carry no address, in a URL or a header, when the owner set none", async () => {
    const { network, sent } = recordingNetwork();
    await fetchEverything(withContact(network, readContact(env("VOYAGER_API_KEY=sk_test\n"))));
    expect(sent.map((request) => new URL(request.url).host)).toEqual(["export.arxiv.org", "arxiv.org", "export.arxiv.org", "eutils.ncbi.nlm.nih.gov"]);
    for (const request of sent) {
      expect(request.url).not.toMatch(ADDRESS);
      for (const value of Object.values(request.headers)) expect(value).not.toMatch(ADDRESS);
    }
  });

  it("carry the owner's address only to the APIs that ask for one, when it is set", async () => {
    const { network, sent } = recordingNetwork();
    await fetchEverything(withContact(network, readContact(env("PAPERPLAY_CONTACT_EMAIL=owner@example.edu\n"))));
    const eutils = sent.find((request) => request.url.startsWith("https://eutils.ncbi.nlm.nih.gov/"));
    expect(eutils?.url).toBe("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=1234567&retmode=xml&tool=paperplay&email=owner%40example.edu");
    for (const request of sent.filter((entry) => entry !== eutils)) expect(request.url).not.toMatch(ADDRESS);
    for (const request of sent) expect(request.headers["user-agent"]).toMatch(/^PaperPlay\/0\.1 \(.+\) \(mailto:owner@example\.edu\)$/);
  });

  it("to the model gateway carry the key in its header and no address", async () => {
    const sent: { url: string; headers: Record<string, string> }[] = [];
    const client = voyagerClient({
      baseUrl: "https://gateway.test/v1",
      apiKey: `sk_${"Fake0".repeat(8)}`,
      timeoutMs: 1000,
      retries: 0,
      backoffMs: 1,
      minIntervalMs: 0,
      fetch: (url, init) => {
        sent.push({ url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
        return Promise.resolve(new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } }));
      },
    });
    await client.complete({ stage: "reader", model: "m", messages: [{ role: "user", content: "Read." }], temperature: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).not.toMatch(ADDRESS);
    for (const value of Object.values(sent[0]?.headers ?? {})) expect(value).not.toMatch(ADDRESS);
  });

  it("are made by code that holds no address of its own", () => {
    const root = join(import.meta.dirname, "..", "..", "..");
    const roots = ["apps/api/src", "apps/web/src", "packages/contracts/src", "packages/pipeline/src", "packages/primitives/src", "packages/ui/src", "scripts"].map((path) => join(root, path));
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (name === "test" || name === "node_modules" ? [] : statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : /\.(ts|tsx|mjs)$/.test(name) ? [join(dir, name)] : []));
    const scanned = roots.flatMap(files);
    expect(scanned.length).toBeGreaterThan(150);
    const holding = scanned.filter((file) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(readFileSync(file, "utf8")));
    expect(holding.map((file) => relative(root, file))).toEqual([]);
  });
});
