/**
 * The G1 local world: flock.planar.weighted at its defaults, opened on the hook seed.
 * Every value here is a teaching choice, not a claim from the paper (ADR-0003).
 */
import type { Action } from "@paperplay/contracts";
import { flockPlanarWeighted as flock } from "@paperplay/primitives/flock";

/**
 * The opening seed: of the defaults sweep's seeds that qualified, the one whose flock
 * becomes a single group soonest and stays one (eval/sweeps/hook-seed.md, `npm run
 * choose:hook-seed`). A test re-runs that rule and fails if this drifts from it.
 */
export const HOOK_SEED = 5;

/** Each control's action id, and the primitive variable it moves. The first is the level's one manipulable. */
export const LOCAL_ACTIONS = {
  "alignment-strength": "alignmentWeight",
  "separation-strength": "separationWeight",
  "cohesion-strength": "cohesionWeight",
  "perception-radius": "perceptionRadius",
} as const;

export type LocalActionId = keyof typeof LOCAL_ACTIONS;

export const PRIMARY_ACTION: LocalActionId = "alignment-strength";

const variables = flock.describe().variables;

function control(actionId: LocalActionId, label: string): Action {
  const variable = variables[LOCAL_ACTIONS[actionId]];
  if (!variable) throw new Error(`${flock.id} has no variable ${LOCAL_ACTIONS[actionId]}`);
  return {
    actionId,
    label,
    targetVariable: LOCAL_ACTIONS[actionId],
    range: [variable.range[0], variable.range[1]],
    unit: variable.unit,
    defaultValue: variable.defaultValue,
    origin: "teaching-choice",
    anchors: [],
  };
}

/** The controls, in the order the bench shows them. Labels and ranges are teaching choices. */
export const LOCAL_CONTROLS: readonly Action[] = [
  control("alignment-strength", "Move together"),
  control("separation-strength", "Personal space"),
  control("cohesion-strength", "Stay close"),
  control("perception-radius", "How far a bird sees"),
];

/** What each control does in this world, in a learner's words, and the slider's step. */
export const CONTROL_NOTES: Readonly<Record<LocalActionId, { readonly help: string; readonly step: number }>> = {
  "alignment-strength": { help: "How quickly each bird turns to match the heading of the birds it can see.", step: 0.05 },
  "separation-strength": { help: "How quickly a bird steers away from birds that come too close.", step: 0.05 },
  "cohesion-strength": { help: "How quickly a bird steers toward the middle of the birds it can see.", step: 0.05 },
  "perception-radius": { help: "Moving together and staying close only count the birds inside this distance.", step: 0.5 },
};
