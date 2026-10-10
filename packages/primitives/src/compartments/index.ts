/**
 * compartments.ode@1.0.0: one trusted solver for every compartment model, which arrives as
 * data, a validated ModelSpec. MODEL.md specifies it; the oracle fixtures in
 * fixtures/oracles/compartments.ode/ are derived from that page.
 */
import type { ModelSpec } from "@paperplay/contracts";
import { compartmentModel, type ModelShowing } from "./primitive.ts";

export {
  accuracy,
  conservation,
  positivity,
  steadyStates,
  type CheckName,
  type CheckProblem,
  type ConservationReport,
  type InvariantReport,
} from "./checks.ts";
export { compileExpr, compileMagnitude, formatExpr, type Compiled, type Indices } from "./expr.ts";
export {
  addPolynomials,
  differentiate,
  expand,
  EXPANSION_LIMITS,
  formatPolynomial,
  isZeroPolynomial,
  multiplyPolynomials,
  rationalOf,
  type Expansion,
  type Factor,
  type Polynomial,
  type PolySymbol,
  type Rational,
  type Term,
} from "./polynomial.ts";
export { compartmentModel, type CompartmentModel, type CompartmentObservables, type CompartmentParams, type CompartmentState, type ModelShowing } from "./primitive.ts";
export { rk4Step, type Rates } from "./rk4.ts";
export { checkUnits, formatUnit, sameUnit, unitOf, type Path, type UnitEnv, type UnitProblem, type UnitResult } from "./units.ts";

/** compartments.ode@1.0.0 as a solver: it binds any ModelSpec into the primitive that runs it. */
export const compartmentsOde = Object.freeze({
  id: "compartments.ode",
  version: "1.0.0",
  bind: (model: ModelSpec, showing: ModelShowing) => compartmentModel(model, showing),
});
