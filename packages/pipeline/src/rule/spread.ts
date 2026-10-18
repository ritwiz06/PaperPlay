/**
 * The hook measures what the headline is about (the owner, 2026-10-18): when the paper's headline
 * speaks of spread, its slowing, curtailing or ending, level 1 measures an infected compartment, as
 * the next-generation matrix identifies them, not one downstream of infection such as the
 * recovered. Pure and deterministic; the controller repairs what it finds.
 */
import type { ModelSpec } from "@paperplay/contracts";
import { nextGeneration } from "../reproduce/ngm.ts";

/** Words saying a headline is about spread. */
export const SPREAD = /\b(spread\w*|transmission|incidence|curtail\w*|eliminat\w*)\b/i;

/** The hook's problem, or null: only for a spread headline, and only when the model's infected compartments can be read. */
export function hookSpreadProblem(model: ModelSpec, headline: { readonly text: string; readonly quote: string }, hookCompartment: string): string | null {
  if (!SPREAD.test(`${headline.text} ${headline.quote}`)) return null;
  const values = Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
  const ngm = nextGeneration(model, values);
  if (!ngm.ok || ngm.value.infected.includes(hookCompartment)) return null;
  return `level 1, the hook, must measure the spread the headline speaks of: an infected compartment (${ngm.value.infected.join(", ")}), not ${hookCompartment}`;
}
