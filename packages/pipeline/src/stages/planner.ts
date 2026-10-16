/**
 * The planner (every-paper.md §3.3): a compartment world's levels, chosen as a teacher would, from
 * the paper's reading and its verified model, with Threshold Town as the worked example. It decides
 * only what a teacher decides: what each level is about, its one control, what the learner watches,
 * and its one What-if with the claim it makes. Every number it names is checked later: the builder
 * against the model, the level rule over 20 starts. The assembler turns the plan into a WorldSpec.
 */
import type { ModelSpec } from "@paperplay/contracts";
import { z } from "zod";
import { completeStructured, type ChatMessage, type ModelClient } from "../models/index.ts";
import type { Reading } from "./reader.ts";
import { DATA_RULE } from "./source.ts";

const Quote = z.string().min(3).max(300);
const Words = (max: number) => z.string().min(1).max(max);

export const PlanLevel = z.strictObject({
  kind: z.enum(["hook", "background", "idea", "method", "evaluation", "result"]),
  /** The paper's finding this level tests, by its number in the list given: 0 is the headline result; null for a level that tests none. */
  finding: z.int().min(0).nullable(),
  title: Words(60),
  /** One sentence: what to do here. */
  goal: Words(160),
  /** The one control: a rate parameter the learner moves while the world runs, never a starting value. */
  control: z.strictObject({ parameter: z.string().min(1), label: Words(50), lowEnd: Words(30), highEnd: Words(30) }),
  /** The compartment the learner watches. */
  watch: z.string().min(1),
  /** The one What-if: one parameter, or a starting value, set to one value. */
  whatIf: z.strictObject({ prompt: Words(140), parameter: z.string().min(1), value: z.number() }),
  /** What the What-if changes, as the level rule will measure it. */
  difference: z.strictObject({
    compartment: z.string().min(1),
    summary: z.enum(["peak", "at", "first-reach", "mean", "lowest", "total"]),
    /** For "at", the time; for "first-reach", the threshold; for "lowest", the time it starts from. Null for "peak", "mean" and "total". */
    at: z.number().nullable(),
    time: z.number().positive(),
    relation: z.enum(["higher", "lower"]),
    by: z.number().nonnegative(),
  }),
  /** The effect, stated so it matches the claim exactly. */
  effect: Words(300),
  /** The prediction asked before the What-if: the claimed outcome first. */
  prediction: z.strictObject({ prompt: Words(200), claimed: Words(60), other: Words(60) }),
  /** The paper's passage the level comes from, verbatim; null for a level beyond the paper. */
  passage: z.strictObject({ title: Words(100), quote: Quote }).nullable(),
  carryForward: Words(200),
});
export type PlanLevel = z.infer<typeof PlanLevel>;

export const Plan = z.strictObject({
  /** The world's name, a place, as Threshold Town or Murmuration Valley. */
  title: Words(40),
  /** How many of the model's time units a second of watching shows at 1x. */
  perWatchSecond: z.number().positive(),
  levels: z.array(PlanLevel).min(3).max(6),
  /** What the world cannot show, each a sentence. */
  limits: z.array(Words(300)).min(1).max(6),
});
export type Plan = z.infer<typeof Plan>;

export const PLANNER_INSTRUCTIONS = [
  "You plan a small learning game, a playable world, from a scientific paper's compartment model, as a teacher would.",
  DATA_RULE,
  "The world has 3 to 5 levels, the first of kind hook. Each level has exactly one control, one thing to watch, and one What-if: a second copy of the world, run beside the first, with one parameter or one starting value changed. The learner predicts what the What-if will do before it runs.",
  "Rules:",
  "- The control is a rate parameter of the model, never a starting value (one whose id ends in 0). Use parameter ids exactly as given.",
  "- The What-if changes one parameter, or one starting value, to one value. Prefer a change the paper itself discusses: a threshold, a treatment, a rate halved or doubled.",
  "- Findings: each level tests one of the paper's findings, given by its number: at least three levels each test a different finding, and level 1, the hook, tests the headline result, finding 0. A level never tests what follows from the model's definitions alone, such as a rate set to zero emptying the compartment it fills, or a compartment fed by nothing staying empty: test what the paper found by solving its model.",
  "- The difference is measured on one compartment. Prefer a summary a person can feel: its 'peak', its value 'at' a time, the time it 'first-reach'es a threshold, or its 'mean' over the level's time. Use 'lowest' from a time on where a fall is the point, and 'total' only when the paper itself reports a total over time. The claim says the What-if's world is 'higher' or 'lower' by more than 'by'. Choose a claim that holds clearly: it will be checked on the paper's values and on 19 starts with every parameter moved by up to a tenth, and must hold on 16 of them. A claim that is only barely true will fail.",
  "- The difference must be plain to see. On a chart of the measured compartment, from zero to a little above the highest value either world reaches, the two worlds' curves must part by at least a tenth of the chart's height. In the scene, a town of 120 figures, at least 3 figures must differ; a compartment too small for that is drawn through a lens, and must still differ by 3 figures there. A What-if that barely changes anything fails, however true.",
  "- When the compartments are shares of a population, adding up to one, every value is a fraction: 0.02 is 2%.",
  "- The level's 'time' is how long both worlds run, in the model's time unit; it must show at four times speed within 20 seconds, so time / perWatchSecond / 4 must be at most 20.",
  "- The effect sentence says exactly what the claim says, in plain words, with its numbers. No overstatement.",
  "- Each passage quote is copied character for character from the paper, 3 to 200 characters. A level beyond the paper has passage null.",
  "- Plain, short sentences in sentence case. No claims the paper does not make.",
].join("\n");

const describeModel = (model: ModelSpec): string =>
  [
    `Time unit: ${model.timeUnit}.`,
    "Compartments:",
    ...model.compartments.map((compartment) => `- ${compartment.id}: ${compartment.name}`),
    "Parameters, with the paper's values (ids ending in 0 are starting values):",
    ...model.parameters.map((parameter) => `- ${parameter.id} (${parameter.symbol}): ${parameter.name} = ${parameter.defaultValue}`),
  ].join("\n");

export function plannerMessages(input: { readonly title: string; readonly reading: Reading; readonly model: ModelSpec; readonly example: string; readonly behaviour: string; readonly response: string }): ChatMessage[] {
  return [
    { role: "system", content: PLANNER_INSTRUCTIONS },
    {
      role: "user",
      content: [
        `PAPER START\nTitle: ${input.title}\nQuestion: ${input.reading.question}\nMechanism: ${input.reading.mechanism}`,
        `Findings, by number:\n0 (the headline result): ${input.reading.result.text} (the paper: "${input.reading.result.quote}")\n${input.reading.findings.map((finding, index) => `${index + 1} (${finding.kind}): ${finding.text} (the paper: "${finding.quote}")`).join("\n")}\nPAPER END`,
        `The model, verified:\n${describeModel(input.model)}`,
        `How the model behaves at the paper's values, as solved:\n${input.behaviour}`,
        `How it responds to change, as solved: each rate halved and doubled, and every compartment whose peak, or value at the end, moves by 15% or more. Choose What-ifs from what moves; a change that moves nothing will fail the visibility rule:\n${input.response}`,
        `A worked example, another world's levels:\n${input.example}`,
        "Plan the world.",
      ].join("\n\n"),
    },
  ];
}

/**
 * Always as plain JSON, validated by Zod, whatever the model honours (ADR-0035): held to this large
 * a schema, models looped on whitespace or thought until their limit, and wrote nothing usable.
 */
/** Room for a reasoning model to think before it writes a plan: 12,000 ran out while thinking. */
export const PLANNER_MAX_TOKENS = 32_000;

export function plan(client: ModelClient, model: string, input: Parameters<typeof plannerMessages>[0]) {
  return completeStructured(client, { stage: "planner", model, messages: plannerMessages(input), temperature: 0, maxTokens: PLANNER_MAX_TOKENS }, Plan, { name: "plan", structuredOutput: false });
}
