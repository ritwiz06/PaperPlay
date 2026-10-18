/**
 * A reply as validated data (ADR-0030). A model that honours JSON-schema structured output on the
 * gateway is asked for it; any other is asked for plain JSON. Either way the reply is parsed and
 * validated by Zod, and a reply that fails is retried once, with the error, before the call fails.
 */
import { z } from "zod";
import { ModelError, type ChatMessage, type ChatRequest, type JsonSchemaFormat, type ModelClient } from "./types.ts";

export interface StructuredResult<T> {
  readonly value: T;
  /** How many replies it took: 1, or 2 after a retry with the error. */
  readonly attempts: number;
}

/** The JSON Schema a Zod schema describes, as the gateway takes it. */
export function jsonSchemaOf(name: string, schema: z.ZodType): JsonSchemaFormat {
  return { name, schema: z.toJSONSchema(schema, { target: "draft-7" }) };
}

/** LaTeX commands a model may write inside a JSON string with one backslash, meaning the backslash. */
const LATEX = new Set(
  "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda varLambda Xi Pi Sigma Phi Psi Omega frac dfrac tfrac times cdot left right mathrm mathbf mathit mathcal text textrm dv dot ddot bar hat tilde sqrt sum prod int partial nabla quad qquad label tag begin end leq geq neq approx infty ln log exp min max".split(" "),
);
/** The letter of the JSON escape that makes each control character. */
const UNESCAPED: Readonly<Record<string, string>> = { "\b": "b", "\t": "t", "\n": "n", "\v": "v", "\f": "f", "\r": "r" };
const ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);

/**
 * A reply's JSON with three common slips mended inside its strings, so a parse never reads them
 * wrong: a backslash that begins a LaTeX command, `\beta`, is kept as a backslash, where JSON
 * would read `\b` as a backspace and `\s` as an error; a control character that such an escape
 * already became, followed by the rest of the command's name, is the command again; and any other
 * raw control character, which JSON forbids, is escaped. Valid JSON with no LaTeX in its strings
 * passes through unchanged.
 */
export function mendJson(body: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i] ?? "";
    if (!inString) {
      if (char === '"') inString = true;
      out += char;
      continue;
    }
    if (char === '"') {
      inString = false;
      out += char;
    } else if (char === "\\") {
      const word = /^[A-Za-z]+/.exec(body.slice(i + 1))?.[0] ?? "";
      const next = body[i + 1] ?? "";
      if (LATEX.has(word) || !ESCAPES.has(next)) out += "\\\\";
      else {
        out += char + next;
        i++;
      }
    } else if (char.charCodeAt(0) < 0x20) {
      // A control character that a JSON escape made of a LaTeX command's first letter, as a
      // gateway that decoded the reply once leaves "\frac" as a form feed and "rac": restored.
      const letter = UNESCAPED[char];
      const word = letter === undefined ? "" : letter + (/^[A-Za-z]*/.exec(body.slice(i + 1))?.[0] ?? "");
      if (letter !== undefined && LATEX.has(word)) out += `\\\\${letter}`;
      else out += char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    } else out += char;
  }
  return out;
}

/** The first JSON value in a reply, from a bare object or one wrapped in a code fence, mended as above. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new SyntaxError("the reply holds no JSON object");
  return JSON.parse(mendJson(body.slice(start, Math.max(body.lastIndexOf("}"), body.lastIndexOf("]")) + 1)));
}

/** Zod's issues in a few plain lines, for the model to correct. */
const issuesOf = (error: z.ZodError): string =>
  error.issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.length > 0 ? issue.path.join(".") : "(the whole reply)"}: ${issue.message}`)
    .join("\n");

/**
 * Asks for a reply matching `schema`. With `structuredOutput`, the gateway holds the model to the
 * schema; without it, the schema goes in the prompt and the model is asked for one JSON object.
 * A reply that fails is tried once more: with the error, to correct; or, when a schema-held reply
 * ran out of room or came back empty (a model can loop on whitespace inside a schema, or think
 * until its limit), afresh as plain JSON, the fallback every model gets alike.
 */
export async function completeStructured<T>(
  client: ModelClient,
  request: Omit<ChatRequest, "jsonSchema">,
  schema: z.ZodType<T>,
  /**
   * `moreRoom`: a plain-JSON reply that ran out of room before it wrote anything is asked again
   * with twice the room, rather than sent back to be corrected. The explainer asks for it, whose
   * replies are the longest (ADR-0044's consequences); calls recorded without it replay as they were.
   */
  options: { readonly name: string; readonly structuredOutput: boolean; readonly moreRoom?: boolean },
): Promise<StructuredResult<T>> {
  const format = jsonSchemaOf(options.name, schema);
  const plainly = (): ChatMessage[] => [
    ...request.messages,
    {
      role: "user",
      content: `Reply with one JSON object and nothing else, no prose and no code fence. It must match this JSON Schema:\n${JSON.stringify(format.schema)}`,
    },
  ];
  let structured = options.structuredOutput;
  let messages: ChatMessage[] = structured ? [...request.messages] : plainly();
  let room = request.maxTokens;
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Each call gets its own copy, so a retry's messages never rewrite what an earlier call was sent.
    const response = await client.complete({ ...request, ...(room === undefined ? {} : { maxTokens: room }), messages: [...messages], ...(structured ? { jsonSchema: format } : {}) });
    let problem: string;
    try {
      const parsed = schema.safeParse(extractJson(response.text));
      if (parsed.success) return { value: parsed.data, attempts: attempt };
      problem = `It does not match the schema:\n${issuesOf(parsed.error)}`;
    } catch (error) {
      problem = `It is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (attempt === 2) throw new ModelError("invalid-response", `${request.model}'s ${request.stage} reply was invalid twice. ${problem}`);
    // A reply that ran out of room before it wrote anything has nothing to correct: with `moreRoom`,
    // it is asked again with twice the room, as a reasoning model thinking at length needs.
    const roomless = options.moreRoom === true && response.finishReason === "length" && response.text.trim() === "" && room !== undefined;
    if (structured && (response.finishReason === "length" || response.text.trim() === "")) {
      structured = false;
      messages = plainly();
      if (roomless) room = (room ?? 0) * 2;
    } else if (roomless) room = (room ?? 0) * 2;
    else messages.push({ role: "assistant", content: response.text }, { role: "user", content: `That reply cannot be used. ${problem}\nReply again with one corrected JSON object only.` });
  }
  throw new ModelError("invalid-response", "unreachable");
}
