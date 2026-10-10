import type { PrimitiveRef } from "@paperplay/contracts";
import { flockPlanarWeighted } from "./agents/flock/index.ts";
import type { Primitive } from "./types.ts";

export interface PrimitiveRegistry {
  has(ref: PrimitiveRef): boolean;
  get(ref: PrimitiveRef): Primitive<unknown, unknown> | undefined;
  list(): PrimitiveRef[];
}

/** Primitives are looked up by exact id and version; there is no "latest". */
export function createRegistry(primitives: readonly Primitive<unknown, unknown>[]): PrimitiveRegistry {
  const byKey = new Map<string, Primitive<unknown, unknown>>();
  const keyOf = (ref: PrimitiveRef): string => `${ref.id}@${ref.version}`;
  for (const primitive of primitives) {
    const key = keyOf(primitive);
    if (byKey.has(key)) throw new Error(`primitive ${key} is already registered`);
    byKey.set(key, primitive);
  }
  return {
    has: (ref) => byKey.has(keyOf(ref)),
    get: (ref) => byKey.get(keyOf(ref)),
    list: () => [...byKey.values()].map(({ id, version }) => ({ id, version })),
  };
}

/** Adding a primitive here requires an ADR. */
export const registry: PrimitiveRegistry = createRegistry([flockPlanarWeighted]);
