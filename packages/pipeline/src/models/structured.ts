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

/** The first JSON value in a reply, from a bare object or one wrapped in a code fence. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new SyntaxError("the reply holds no JSON object");
  return JSON.parse(body.slice(start, Math.max(body.lastIndexOf("}"), body.lastIndexOf("]")) + 1));
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
 */
export async function completeStructured<T>(
  client: ModelClient,
  request: Omit<ChatRequest, "jsonSchema">,
  schema: z.ZodType<T>,
  options: { readonly name: string; readonly structuredOutput: boolean },
): Promise<StructuredResult<T>> {
  const format = jsonSchemaOf(options.name, schema);
  const messages: ChatMessage[] = options.structuredOutput
    ? [...request.messages]
    : [
        ...request.messages,
        {
          role: "user",
          content: `Reply with one JSON object and nothing else, no prose and no code fence. It must match this JSON Schema:\n${JSON.stringify(format.schema)}`,
        },
      ];
  for (let attempt = 1; attempt <= 2; attempt++) {
    // Each call gets its own copy, so a retry's messages never rewrite what an earlier call was sent.
    const response = await client.complete({ ...request, messages: [...messages], ...(options.structuredOutput ? { jsonSchema: format } : {}) });
    let problem: string;
    try {
      const parsed = schema.safeParse(extractJson(response.text));
      if (parsed.success) return { value: parsed.data, attempts: attempt };
      problem = `It does not match the schema:\n${issuesOf(parsed.error)}`;
    } catch (error) {
      problem = `It is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (attempt === 2) throw new ModelError("invalid-response", `${request.model}'s ${request.stage} reply was invalid twice. ${problem}`);
    messages.push({ role: "assistant", content: response.text }, { role: "user", content: `That reply cannot be used. ${problem}\nReply again with one corrected JSON object only.` });
  }
  throw new ModelError("invalid-response", "unreachable");
}
