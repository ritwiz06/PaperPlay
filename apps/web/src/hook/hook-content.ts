/**
 * Hard-coded content for the /world/hook design spike (ADR-0008). Nothing here comes from a
 * WorldSpec yet, and nothing is quoted from a paper: the one passage is a placeholder, and
 * says so, until the source map exists (G2). The explanations restate the flock's own
 * model (MODEL.md, E3), so they are teaching choices.
 */
import type { Origin } from "@paperplay/contracts";

export type Depth = "beginner" | "intermediate" | "advanced";

export const DEPTHS: readonly { readonly depth: Depth; readonly label: string }[] = [
  { depth: "beginner", label: "Beginner" },
  { depth: "intermediate", label: "Intermediate" },
  { depth: "advanced", label: "Advanced" },
];

/** The level path, hook first. Only the hook is built in the spike. */
export const LEVELS: readonly { readonly id: string; readonly title: string }[] = [
  { id: "hook", title: "A flock with no leader" },
  { id: "background", title: "Background" },
  { id: "idea", title: "The idea" },
  { id: "method", title: "The method" },
  { id: "evaluation", title: "Evaluation" },
  { id: "result", title: "Result" },
];

export const HOOK = {
  title: "A flock with no leader",
  goal: "Slide Move together, and watch the whole flock turn as one.",
  control: { actionId: "alignment-strength", label: "Move together", unit: "per second", step: 0.05 },
  explain: {
    beginner: "Each bird turns to match the way its neighbours are flying. No bird leads.",
    intermediate:
      "Each step, a bird steers toward the average heading of the birds it can see. Move together sets how hard it steers.",
    advanced: "Aᵢ = w_a (ūᵢ − vᵢ): bird i accelerates toward ūᵢ, the mean velocity of the birds it sees, at rate w_a, which is Move together.",
  } satisfies Record<Depth, string>,
  whatIf: {
    question: "What if birds ignored their neighbours' headings?",
    answer:
      "In the full world, this splits the screen: this flock on one side, the same flock with Move together at 0 on the other, and one measured difference between them.",
  },
} as const;

/** The one passage. A placeholder: it says what will stand here, and quotes nothing. */
export const PASSAGE = {
  title: "Matching the neighbours' heading",
  text: "Placeholder passage. In the authored world, the paper's own words about birds matching the heading of the flockmates near them stand here. Nothing is quoted from a paper yet.",
  locator: "Its section and page arrive with the source map.",
} as const;

/** Chips name their origin in a word or two; the journal's legend gives the full name and meaning. */
export const CHIP_WORDS: Readonly<Record<Origin, string>> = {
  "paper-derived": "Paper",
  "teaching-choice": "Teaching choice",
  "computed-observation": "Measured",
  "generated-inference": "Model's guess",
};
