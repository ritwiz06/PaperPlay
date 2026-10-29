/**
 * The mechanism writer (ADR-0058): for a paper no family covers, a coding model writes the paper's
 * mechanism as one plain JavaScript module, from the reader's mechanism and anchored findings and a
 * short description of the kits; code only, under a size limit. It never sees a check's code, only
 * the problems the checks found, when it is asked to fix what it wrote. A paper with nothing a
 * learner could honestly play with is refused here, and goes to the explainer page instead.
 */
import { MECHANISM_KITS, MECHANISM_LIMITS, type SourceText } from "@paperplay/contracts";
import type { ChatMessage } from "../models/index.ts";
import type { Reading } from "./reader.ts";
import { DATA_RULE } from "./source.ts";

/** What the writer is asked for, half the sandbox's limit: the job waits on every character it writes (ADR-0058). */
export const WRITER_ASKS_CHARS = 12_000;

export const MECHANISM_WRITER_INSTRUCTIONS = [
  "You write a small simulation of the mechanism a scientific paper proposes, as one plain JavaScript module, so a learner can play with it in a game. Code checks it in a sandbox before anyone sees it.",
  DATA_RULE,
  "The module has exactly this shape:",
  "const mechanism = {",
  '  title: "…",                 // at most 80 characters',
  `  kit: "towers",              // one of ${MECHANISM_KITS.join(", ")}`,
  '  params: [{ id: "temperature", label: "Softmax temperature", unit: "", min: 0.1, max: 4, default: 1, paper: { normal: 1, without: null, meaning: "The paper has no temperature; taking it away means nothing." } }], // 1 to 6; add integer: true for a count',
  '  measurements: [{ id: "entropy", label: "Spread of attention", unit: "bits", meaning: "One plain sentence." }], // 1 to 6',
  "  steps: 200,                 // one run's length, 1 to 1000",
  '  stepLabel: "iteration",     // what one step is, a word or two',
  "  init(seed, params) { return state; },",
  "  step(state, params) { return state; },",
  "  measure(state) { return { entropy: 1.2 }; },  // every measurement's id, a finite number",
  "  frame(state) { return { /* the kit's shape, below */ }; },",
  "};",
  "Rules:",
  "- Plain JavaScript in strict mode: no import, require, export, async, eval, DOM, network, timers, Date or Math.random. Chance comes only from a generator seeded by init's seed, such as mulberry32 written out in the module; keep its position in the state if step needs chance.",
  "- State is plain data: numbers, strings, arrays and objects. step returns the next state, new or changed.",
  "- Each parameter is one the paper discusses that a learner can move while the world runs, and moving it across its range changes at least one measurement; each measurement responds to at least one parameter. Ranges are honest: the paper's own value as the default, inside the range.",
  "- Ids are camelCase, starting with a lowercase letter. Units in words, or \"\" when there is none.",
  "- Every parameter says what the paper means by it, as paper: normal, the paper's own value, which is also the default; without, the value inside the range that takes it away as the paper means, or null when taking it away means nothing in the paper; meaning, that in a sentence. Taking something away is what the paper means by it: removing the √dk scaling is dividing by 1, never multiplying the scores by 0. A What-if is made from these, so a range must hold the without value and nothing past it that would stop the mechanism itself.",
  "- Compute every outcome from the mechanism. Never write in the paper's reported results, as constants or tables: the checks look for the paper's numbers in the code.",
  `- Small and fast: a step with its measurement and frame well under ${MECHANISM_LIMITS.stepMs} ms; at most 64 towers, 2,000 particles, a 128 by 128 grid, 500 nodes.`,
  `- Short: about 150 lines, at most ${WRITER_ASKS_CHARS.toLocaleString("en")} characters; the sandbox refuses anything over ${MECHANISM_LIMITS.sourceChars.toLocaleString("en")}. A short module is written quickly, and the job waits for it. Comment briefly, in plain sentences, what each part is, naming the paper's section or equation it comes from.`,
  "- A toy at a small scale, not a reproduction of the paper's experiments: it shows how the mechanism behaves.",
  "The kits' frames; every x, y, height, weight, value, size and cell is from 0 to 1, x running rightward and y downward, a group from 0 to 5 picks a colour, a label is at most 24 characters:",
  "- particles: { particles: [{ x, y, heading, size, group }] }, heading in radians, optional with size and group; agents or particles moving on a square.",
  "- towers: { towers: [{ label, height, group }], beams: [{ from, to, weight, group }] }, from and to counting towers from 0; tokens and the attention between them, items and links.",
  "- grid: { rows, cols, cells: [rows × cols values, row by row] }; a field, a lattice, a matrix.",
  "- network: { nodes: [{ x, y, value, label, group }], edges: [{ from, to, weight }] }; a graph, a layered network.",
  "- landscape: { heights: [[…], …], marks: [{ x, y, label, group }] }, 2 to 64 rows of equal length; a surface with points on it, such as a loss and an optimiser.",
  "- charts: { bars: [{ label, value, group }] }; amounts side by side, when nothing above fits.",
  "Answer with the module alone, in one ```javascript block, and nothing after it.",
  "If the paper has no mechanism a learner could honestly play with, such as a survey, a benchmark or a theorem with no dynamics, or its mechanism cannot be simulated without inventing its outcomes, such as agents whose behaviour only a language model could produce, answer exactly NO MECHANISM: and one sentence why.",
].join("\n");

/** What the writer reads of the paper: what the reader found, and the equations that define its model. */
export interface MechanismWriterInput {
  readonly title: string;
  readonly abstract: string;
  readonly reading: Reading;
  readonly equations: readonly string[];
  /** A module that passes every check, for its shape. */
  readonly example: string;
}

export function mechanismWriterMessages(input: MechanismWriterInput): ChatMessage[] {
  const findings = [input.reading.result, ...input.reading.findings].map((finding, index) => `${index} ${index === 0 ? "(the headline result)" : ""}: ${finding.text} The paper says: "${finding.quote}"`).join("\n");
  return [
    { role: "system", content: `${MECHANISM_WRITER_INSTRUCTIONS}\n\nA module that passes every check, for its shape:\n\`\`\`javascript\n${input.example}\n\`\`\`` },
    {
      role: "user",
      content: [
        `PAPER START\nTitle: ${input.title}\n\nAbstract: ${input.abstract}`,
        `The question it asks: ${input.reading.question}\nThe mechanism it proposes: ${input.reading.mechanism}`,
        `Equations that define its model:\n${input.equations.slice(0, 12).join("\n") || "(none given)"}`,
        `Its findings, by number:\n${findings}\nPAPER END`,
        "Write the module.",
      ].join("\n\n"),
    },
  ];
}

/** The messages that ask the writer to fix its module: what it wrote, and every problem the checks found. */
export function mechanismFixMessages(input: MechanismWriterInput, previous: readonly { readonly source: string; readonly problems: string }[]): ChatMessage[] {
  return [
    ...mechanismWriterMessages(input),
    ...previous.flatMap((round): ChatMessage[] =>
      // A round whose reply never came has nothing to show: only what went wrong.
      round.source === ""
        ? [{ role: "user", content: `${round.problems}\nAnswer with a shorter module, in one \`\`\`javascript block.` }]
        : [
            { role: "assistant", content: `\`\`\`javascript\n${round.source}\n\`\`\`` },
            { role: "user", content: `The checks found these problems:\n${round.problems}\nFix every one, changing nothing else, and answer with the whole module again in one \`\`\`javascript block.` },
          ],
    ),
  ];
}

/** What the writer answered: a module's source, a refusal with its reason, or nothing usable. */
export type WriterReply = { readonly kind: "module"; readonly source: string } | { readonly kind: "refused"; readonly reason: string } | { readonly kind: "unusable"; readonly problem: string };

/** The module in a reply: its fenced block, the longest if there are several, or the whole reply when it is bare code. */
export function moduleOf(text: string): WriterReply {
  const refusal = /^\s*NO MECHANISM:\s*([\s\S]+)$/.exec(text);
  if (refusal) return { kind: "refused", reason: (refusal[1] ?? "").trim().slice(0, 400) };
  const blocks = [...text.matchAll(/```(?:javascript|js)?[ \t]*\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
  const source = (blocks.length > 0 ? blocks.reduce((a, b) => (b.length > a.length ? b : a)) : text).trim();
  if (!/\bmechanism\b/.test(source)) return { kind: "unusable", problem: "the reply holds no module that defines mechanism: answer with the whole module in one ```javascript block" };
  return { kind: "module", source };
}

/** The writer's input from what a job has: the reading's model equations by id, or the paper's first ones when it names none. */
export function mechanismWriterInput(text: SourceText, title: string, reading: Reading, example: string): MechanismWriterInput {
  const front = text.sections.find((section) => section.title === "Abstract");
  const named = reading.modelEquations.map((id) => text.equations.find((equation) => equation.id === id)).filter((equation) => equation !== undefined);
  const equations = (named.length > 0 ? named : text.equations.slice(0, 6)).map((equation) => equation.latex.slice(0, 400));
  return { title, abstract: (front ? text.text.slice(front.start, front.end) : text.text.slice(0, 2000)).slice(0, 3000), reading, equations, example };
}
