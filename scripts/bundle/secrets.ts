/**
 * The bundle secret check (CLAUDE.md boundary 7, ADR-0030): what the client bundle may never
 * hold. Model calls happen only in apps/api, so the bundle names no key, no key's format, no
 * key variable and no model gateway; and when apps/api/.env is present, none of its secret
 * values. A finding names the file and the rule, never the text it matched, so a leak is never
 * printed while it is reported.
 */

export interface BundleFile {
  /** The file's path, relative to the build's folder. */
  readonly name: string;
  readonly text: string;
}

export interface SecretFinding {
  readonly file: string;
  /** Which rule matched, in words. The matched text is never included. */
  readonly rule: string;
}

interface Rule {
  readonly rule: string;
  readonly pattern: RegExp;
}

/** Key formats, key variables and the gateway, as patterns. */
export const RULES: readonly Rule[] = Object.freeze([
  { rule: "a key in the Voyager gateway's format (sk_ followed by 20 or more characters)", pattern: /sk_[A-Za-z0-9_-]{20,}/ },
  { rule: "a key in another vendor's format (sk- followed by 20 or more characters)", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { rule: "the name of a key variable (VOYAGER_API_KEY, ANTHROPIC_API_KEY or OPENAI_API_KEY)", pattern: /\b(VOYAGER|ANTHROPIC|OPENAI)_API_KEY\b/ },
  { rule: "the model gateway's host (openai.rc.asu.edu), which only apps/api may call", pattern: /openai\.rc\.asu\.edu/ },
]);

/**
 * Values in an env file worth guarding: those of variables named as keys, secrets or tokens, long
 * enough to be one, and the owner's contact address, whatever its length (ADR-0039).
 */
export function secretValues(env: string): { readonly name: string; readonly value: string }[] {
  return env.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) return [];
    const [, name = "", raw = ""] = match;
    const value = raw.trim().replace(/^(["'])(.*)\1$/, "$2");
    return (/(KEY|SECRET|TOKEN|PASSWORD)/.test(name) && value.length >= 12) || (/(EMAIL|CONTACT)/.test(name) && value.length > 0) ? [{ name, value }] : [];
  });
}

/** Every rule each file breaks, and every guarded value it holds, by name only. */
export function findSecrets(files: readonly BundleFile[], values: readonly { readonly name: string; readonly value: string }[] = []): SecretFinding[] {
  return files.flatMap((file) => [
    ...RULES.filter((entry) => entry.pattern.test(file.text)).map((entry) => ({ file: file.name, rule: entry.rule })),
    ...values.filter((entry) => file.text.includes(entry.value)).map((entry) => ({ file: file.name, rule: `the value of ${entry.name} from apps/api/.env` })),
  ]);
}
