/**
 * Hard-coded content for /world/hook on the game-first shell (ADR-0008), until WorldSpec
 * arrives. Nothing here is quoted from a paper: the one passage is a placeholder, and says
 * so, until the source map exists (G2). The explanations restate the flock's own model
 * (MODEL.md, E3), so they are teaching choices.
 */
import type { Depth, MapLevel } from "@paperplay/ui/react";

/** The level path, hook first. Only the hook is built so far. */
export const LEVELS: readonly Omit<MapLevel, "state">[] = [
  { id: "hook", title: "A flock with no leader" },
  { id: "background", title: "Background" },
  { id: "idea", title: "The idea" },
  { id: "method", title: "The method" },
  { id: "evaluation", title: "Evaluation" },
  { id: "result", title: "Result" },
];

export const HOOK = {
  id: "hook",
  title: "A flock with no leader",
  goal: "Slide Move together, and watch the whole flock turn as one.",
  control: {
    actionId: "alignment-strength",
    label: "Move together",
    unit: "per second",
    step: 0.05,
    ends: ["Ignore neighbours", "Follow closely"] as const,
  },
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

/** Alignment's passage. A placeholder: it says what will stand here, and quotes nothing. */
export const PASSAGE = {
  title: "Matching the neighbours' heading",
  text: "Placeholder passage. In the authored world, the paper's own words about birds matching the heading of the flockmates near them stand here. Nothing is quoted from a paper yet.",
  locator: "Its section and page arrive with the source map.",
  placeholder: true,
} as const;
