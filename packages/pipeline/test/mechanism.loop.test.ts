import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeCheckedMechanism } from "../src/mechanism/loop.ts";
import { ModelError, type ChatMessage } from "../src/models/index.ts";
import { mechanismWriterMessages, moduleOf, type MechanismWriterInput } from "../src/stages/mechanism-writer.ts";

// The writer's fix loop (ADR-0058), with a scripted writer: the checks decide, the writer reads
// their words, and the loop ends on a pass, a refusal, three fixes, or a deadline it cannot meet.

const root = join(import.meta.dirname, "..", "..", "..");
const reference = readFileSync(join(root, "fixtures", "mechanisms", "row-attention.js"), "utf8");
const deaf = reference.replace("const width = params.width;", "const width = 32;");

const input: MechanismWriterInput = {
  title: "Attention Is All You Need",
  abstract: "We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.",
  reading: {
    question: "Can attention alone replace recurrence?",
    mechanism: "Scaled dot-product attention lets each position weigh every other.",
    modelEquations: [],
    result: { text: "The Transformer reaches 28.4 BLEU.", quote: "28.4 BLEU" },
    findings: [{ kind: "result", text: "Scaling by the square root of dk keeps softmax gradients from vanishing.", quote: "we scale the dot products" }],
  },
  equations: ["\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}(QK^T/\\sqrt{d_k})V"],
  example: reference,
};

/** A writer that answers each round from a script, and keeps what it was asked. */
const scripted = (replies: readonly string[]) => {
  const asked: ChatMessage[][] = [];
  return {
    asked,
    call: (messages: ChatMessage[], round: number) => {
      asked.push(messages);
      return Promise.resolve(replies[round] ?? replies[replies.length - 1] ?? "");
    },
  };
};
const fenced = (source: string) => `Here it is.\n\`\`\`javascript\n${source}\n\`\`\`\n`;

describe("[R08] the writer's fix loop (ADR-0058)", () => {
  it("sends the checks' problems back, and stops once the module passes", async () => {
    const writer = scripted([fenced(deaf), fenced(reference)]);
    const outcome = await writeCheckedMechanism(input, { call: writer.call });
    expect(outcome.kind).toBe("passed");
    expect(outcome.rounds.map((round) => round.round)).toEqual([0, 1]);
    const fix = writer.asked[1] ?? [];
    expect(fix.at(-2)?.role).toBe("assistant");
    expect(fix.at(-1)?.content).toContain("moving width from 4 to 64 changes no measurement");
  });

  it("gives up after three fixes, keeping the last module and its report", async () => {
    const outcome = await writeCheckedMechanism(input, { call: scripted([fenced(deaf)]).call });
    expect(outcome.kind).toBe("failed");
    expect(outcome.rounds).toHaveLength(4);
    if (outcome.kind === "failed") expect(outcome.reason).toContain("after 3 rounds of fixes");
  });

  it("takes a refusal as the paper's answer, and asks again for a reply that holds no module", async () => {
    expect((await writeCheckedMechanism(input, { call: scripted(["NO MECHANISM: it is a survey of benchmarks."]).call })).kind).toBe("refused");
    const writer = scripted(["I would model attention as follows.", fenced(reference)]);
    const outcome = await writeCheckedMechanism(input, { call: writer.call });
    expect(outcome.kind).toBe("passed");
    expect(writer.asked[1]?.at(-1)?.content).toContain("holds no module");
  });

  it("counts a reply that never came within its time as a lost round, and asks again for a shorter module", async () => {
    const asked: ChatMessage[][] = [];
    const outcome = await writeCheckedMechanism(input, {
      call: (messages, round) => {
        asked.push(messages);
        return round === 0 ? Promise.reject(new ModelError("timeout", "the writer call ran past its 420 s")) : Promise.resolve(fenced(reference));
      },
    });
    expect(outcome.kind).toBe("passed");
    expect(outcome.rounds[0]?.problems).toContain("did not arrive within its time");
    expect(asked[1]?.at(-1)?.content).toContain("Answer with a shorter module");
    expect(asked[1]?.some((message) => message.role === "assistant")).toBe(false);
  });

  it("begins no fix the deadline cannot hold", async () => {
    let left = 60_000;
    const writer = scripted([fenced(deaf)]);
    const outcome = await writeCheckedMechanism(input, {
      call: async (messages, round) => {
        left = 10;
        return writer.call(messages, round);
      },
      timeLeft: () => left,
    });
    expect(outcome.kind).toBe("failed");
    expect(outcome.rounds).toHaveLength(1);
  });

  it("tells the writer what the paper means by each parameter, to compute and never restate, and when to refuse (ADR-0058's amendment)", () => {
    const system = mechanismWriterMessages(input)[0]?.content ?? "";
    expect(system).toContain("removing the √dk scaling is dividing by 1, never multiplying the scores by 0");
    expect(system).toContain("Never write in the paper's reported results");
    expect(system).toContain("cannot be simulated without inventing its outcomes");
  });

  it("finds the module in a reply: the longest fenced block, or bare code", () => {
    expect(moduleOf("```js\nconst x = 1;\n```\n```javascript\nconst mechanism = {};\n```")).toEqual({ kind: "module", source: "const mechanism = {};" });
    expect(moduleOf("const mechanism = { title: 'bare' };")).toEqual({ kind: "module", source: "const mechanism = { title: 'bare' };" });
    expect(moduleOf("NO MECHANISM: a theorem with no dynamics.")).toEqual({ kind: "refused", reason: "a theorem with no dynamics." });
  });
});
