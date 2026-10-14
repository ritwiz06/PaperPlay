/**
 * The paper-text sanitiser (R09, every-paper.md §3): a source's text is untrusted input. Before any
 * prompt holds it, passages that read as instructions to a model are blanked, each removal logged,
 * so paper text can never grant a permission, ask for a secret or change the controller's policy.
 * Removed spans become spaces of the same length, so every anchor's offsets into the text still hold;
 * a quote cannot land on a removed passage because the text there is gone.
 */

export interface Removal {
  /** The span blanked, [start, end) in the text. */
  readonly start: number;
  readonly end: number;
  /** The rule that matched, in words. */
  readonly rule: string;
  /** The passage removed, shortened, for the job's log. */
  readonly excerpt: string;
}

export interface Sanitised {
  readonly text: string;
  readonly removals: readonly Removal[];
}

/** Instruction-like passages, each matched within one sentence or line. */
export const SANITISER_RULES: readonly { readonly rule: string; readonly pattern: RegExp }[] = Object.freeze([
  { rule: "an order to ignore or override instructions", pattern: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your|the|system)\b[^.\n]{0,40}\b(instructions?|prompts?|rules?|directions?|guidelines?)\b[^.\n]*/gi },
  { rule: "an address to an AI or language model", pattern: /\b(you are|act as|pretend to be|as an?)\s+(an?\s+)?(ai|a\.i\.|language model|llm|assistant|chatbot|gpt|claude)\b[^.\n]*/gi },
  { rule: "a mention of a system or developer prompt", pattern: /\b(system|developer)\s+(prompt|message|instructions?)\b[^.\n]*/gi },
  { rule: "a chat-format role marker", pattern: /<\|?\s*(im_start|im_end|system|assistant|user|endoftext)\s*\|?>|^\s*(###\s*)?(system|assistant|user|instruction)\s*:\s*/gim },
  { rule: "a request for a key, password or credential", pattern: /\b(api[_ -]?key|password|credential|secret key|access token|bearer token)s?\b[^.\n]*/gi },
  { rule: "an order about the reply's format or content", pattern: /\b(respond|reply|answer|output|print|return)\s+(only|with|in)\b[^.\n]{0,60}\b(json|yes|no|the following|this text|verbatim)\b[^.\n]*/gi },
]);

const blank = (text: string, start: number, end: number): string => text.slice(0, start) + " ".repeat(end - start) + text.slice(end);

export function sanitise(text: string): Sanitised {
  const found: Removal[] = [];
  for (const { rule, pattern } of SANITISER_RULES) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (end > start) found.push({ start, end, rule, excerpt: match[0].replace(/\s+/g, " ").trim().slice(0, 120) });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  // Overlapping matches are one removal, under the first rule that reached it.
  const removals: Removal[] = [];
  for (const removal of found) {
    const last = removals.at(-1);
    if (last && removal.start < last.end) {
      if (removal.end > last.end) removals[removals.length - 1] = { ...last, end: removal.end };
    } else removals.push(removal);
  }
  let out = text;
  for (const removal of removals) out = blank(out, removal.start, removal.end);
  return { text: out, removals };
}
