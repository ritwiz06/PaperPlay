/**
 * learning.landscape@1.0.0: one trusted primitive for every optimizer's update rule, which arrives
 * as data, a validated DescentSpec (ADR-0047). The oracle fixtures in
 * fixtures/oracles/learning.landscape/ are derived by hand from the rules' own equations.
 */
import type { DescentSpec } from "@paperplay/contracts";
import { landscapeModel, type LandscapeShowing } from "./primitive.ts";

export { gradientAt, landscapeModel, lossAt, lowestOf, type LandscapeModel, type LandscapeObservables, type LandscapeParams, type LandscapeShowing, type LandscapeState } from "./primitive.ts";

/** learning.landscape@1.0.0 as a solver: it binds any DescentSpec into the primitive that runs it. */
export const learningLandscape = Object.freeze({
  id: "learning.landscape",
  version: "1.0.0",
  bind: (model: DescentSpec, showing: LandscapeShowing) => landscapeModel(model, showing),
});
