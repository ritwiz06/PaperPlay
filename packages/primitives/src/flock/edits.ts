import type { EntityEdit } from "@paperplay/contracts";
import type { Entity, FlockState } from "./state.ts";
import { wrap } from "./torus.ts";

const holds = (state: FlockState, id: string): boolean =>
  state.beacons.some((entity) => entity.id === id) || state.obstacles.some((entity) => entity.id === id);

/**
 * E16 place: append a named beacon or obstacle, wrapped onto the torus. E17 remove: drop
 * the entity with that id from whichever list holds it. Birds and stepIndex are untouched.
 */
export function applyFlockEdit(state: FlockState, edit: EntityEdit): FlockState {
  if (edit.kind === "place") {
    if (!Number.isFinite(edit.x) || !Number.isFinite(edit.y)) {
      throw new RangeError(`cannot place ${edit.entityId} at (${edit.x}, ${edit.y})`);
    }
    if (holds(state, edit.entityId)) throw new Error(`entity ${edit.entityId} already exists`);
    const entity: Entity = { id: edit.entityId, x: wrap(edit.x, state.width), y: wrap(edit.y, state.height) };
    return edit.entity === "beacon"
      ? { ...state, beacons: [...state.beacons, entity] }
      : { ...state, obstacles: [...state.obstacles, entity] };
  }
  if (!holds(state, edit.entityId)) throw new Error(`there is no entity ${edit.entityId} to remove`);
  return {
    ...state,
    beacons: state.beacons.filter((entity) => entity.id !== edit.entityId),
    obstacles: state.obstacles.filter((entity) => entity.id !== edit.entityId),
  };
}
