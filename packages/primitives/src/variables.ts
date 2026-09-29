import { z } from "zod";
import type { VariableDescription } from "./types.ts";

export type VariableTable = Readonly<Record<string, VariableDescription>>;

/** One bounded number schema per variable, whole numbers where the table says so. */
export function shapeOf<const T extends VariableTable>(variables: T): { [K in keyof T]: z.ZodNumber } {
  const shape: Record<string, z.ZodNumber> = {};
  for (const [name, variable] of Object.entries(variables)) {
    const base = variable.integer ? z.int() : z.number();
    shape[name] = base.min(variable.range[0]).max(variable.range[1]);
  }
  return shape as { [K in keyof T]: z.ZodNumber };
}

export function defaultsOf<const T extends VariableTable>(variables: T): { [K in keyof T]: number } {
  const defaults: Record<string, number> = {};
  for (const [name, variable] of Object.entries(variables)) defaults[name] = variable.defaultValue;
  return defaults as { [K in keyof T]: number };
}

/** Freezes a plain-data tree so shared descriptions cannot be edited by a caller. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
