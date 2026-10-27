/**
 * Worlds by paper and version (R13, ADR-0053): a world a job made ready is kept under
 * apps/api/data/worlds/, which git ignores, so a second request for the same paper is served at
 * once rather than made again. Only a world made under today's rules is served (RULES_VERSION):
 * one kept from before a rule changed is made again. A PDF from this machine is never kept, as it
 * names no paper and version; a request may ask for a fresh world.
 *
 * Stage outputs are reused by regenerations through the recordings, keyed by each call's prompt
 * (ADR-0030): the reading and the two transcriptions of a paper whose text and instructions have
 * not changed are replayed, not asked again, and are asked again exactly when either changes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_VERSION } from "@paperplay/pipeline/controller";

export interface CachedWorld {
  readonly schemaVersion: "cached-world/1";
  readonly source: string;
  /** The job that made it, and when it became ready. */
  readonly jobId: string;
  readonly madeAt: string;
  /** RULES_VERSION when it was made. */
  readonly rules: string;
  readonly world: unknown;
  /** A generated world's module (ADR-0058), which its page runs in the sandbox; absent for every other world. */
  readonly mechanism?: unknown;
}

export const CACHE_DIR = join(import.meta.dirname, "..", "data", "worlds");

/** A paper's key: its arXiv id with its version, or its PMCID; null for anything else, a PDF included. */
export function cacheKey(source: string): string | null {
  const arxiv = /^arxiv:(\d{4}\.\d{4,5}v\d+)$/i.exec(source.trim());
  if (arxiv) return `arxiv-${arxiv[1] ?? ""}`;
  const pmc = /^pmc:(PMC\d{5,9})$/i.exec(source.trim());
  return pmc ? `pmc-${(pmc[1] ?? "").toUpperCase()}` : null;
}

export interface WorldCache {
  get(source: string): CachedWorld | null;
  getByKey(key: string): CachedWorld | null;
  put(source: string, jobId: string, world: unknown, madeAt: string, mechanism?: unknown): void;
}

/** The cache in a folder, or in memory alone when the folder is null, as tests keep it. */
export function worldCache(folder: string | null = CACHE_DIR, rules: string = RULES_VERSION): WorldCache {
  const held = new Map<string, CachedWorld>();
  const getByKey = (key: string): CachedWorld | null => {
    if (!/^[a-z]+-[A-Za-z0-9.]+$/.test(key)) return null;
    let found = held.get(key) ?? null;
    if (!found && folder && existsSync(join(folder, `${key}.json`))) found = JSON.parse(readFileSync(join(folder, `${key}.json`), "utf8")) as CachedWorld;
    return found && found.rules === rules ? found : null;
  };
  return {
    getByKey,
    get: (source) => {
      const key = cacheKey(source);
      return key === null ? null : getByKey(key);
    },
    put(source, jobId, world, madeAt, mechanism) {
      const key = cacheKey(source);
      if (key === null) return;
      const entry: CachedWorld = { schemaVersion: "cached-world/1", source, jobId, madeAt, rules, world, ...(mechanism === undefined ? {} : { mechanism }) };
      held.set(key, entry);
      if (folder) {
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`);
      }
    },
  };
}
