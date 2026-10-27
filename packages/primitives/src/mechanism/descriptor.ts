/**
 * A generated mechanism as the builder sees it (ADR-0058): its manifest's parameters and
 * measurements described as a primitive's variables and observables, in the generated family,
 * counting time in steps. It describes and never runs: a module runs only in its sandbox, so init,
 * step and measure here refuse.
 */
import type { MechanismManifest } from "@paperplay/contracts";
import { z } from "zod";
import type { Primitive } from "../types.ts";

const refuse = (): never => {
  throw new Error("a generated mechanism runs only in its sandbox");
};

export function mechanismPrimitive(ref: { readonly id: string; readonly version: string }, manifest: MechanismManifest, perWatchSecond: number): Primitive<Record<string, number>, unknown> {
  const variables = Object.fromEntries(manifest.params.map((param) => [param.id, { unit: param.unit || "dimensionless", meaning: param.label, range: [param.min, param.max] as const, defaultValue: param.default, phase: "live" as const, integer: param.integer ?? false }]));
  const observables = Object.fromEntries(manifest.measurements.map((measurement) => [measurement.id, { unit: measurement.unit || "dimensionless", meaning: measurement.meaning }]));
  const paramSchema = z.strictObject(Object.fromEntries(manifest.params.map((param) => [param.id, (param.integer ? z.int() : z.number()).min(param.min).max(param.max)]))) as unknown as z.ZodType<Record<string, number>>;
  return Object.freeze({
    id: ref.id,
    version: ref.version,
    family: "generated" as const,
    fixedTimestep: 1,
    time: Object.freeze({ unit: "step" as const, perWatchSecond }),
    space: Object.freeze({ kind: "none" as const }),
    paramSchema,
    stateSchema: z.unknown(),
    init: refuse,
    step: refuse,
    measure: refuse,
    describe: () => ({ variables, observables, assumptions: [`${manifest.title}: a module a coding model wrote for this paper, checked for its behaviour, never verified against the paper.`] }),
  });
}
