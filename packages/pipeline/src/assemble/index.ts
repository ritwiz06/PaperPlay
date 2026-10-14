/**
 * @paperplay/pipeline/assemble: a plan, its words and a verified model as a worldspec/3, by rule;
 * the solver's step chosen by the accuracy check; and the model's behaviour in words for the planner.
 */
export { chooseStep, defaultsOf, describeBehaviour } from "./model.ts";
export { assembleWorld, type AssembleInput, type Assembled } from "./world.ts";
export { checkProvenance, type ProvenanceProblem } from "../checks/provenance.ts";
