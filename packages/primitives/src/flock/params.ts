import { z } from "zod";
import { deepFreeze, defaultsOf, shapeOf, type VariableTable } from "../variables.ts";

// Ranges are teaching choices carried over from the Murmuration Valley prototype. The four
// rule defaults were chosen by a deterministic sweep (ADR-0003, eval/sweeps/); the rest
// are the prototype's. None of them comes from the paper. MODEL.md has the equations.
export const FLOCK_VARIABLES = deepFreeze({
  agentCount: {
    unit: "birds",
    meaning: "How many birds share the world.",
    range: [2, 400],
    defaultValue: 72,
    phase: "init",
    integer: true,
  },
  worldWidth: {
    unit: "world units",
    meaning: "Width of the wrap-around world; a bird flying off one side comes back on the other.",
    range: [8, 200],
    defaultValue: 32,
    phase: "init",
    integer: false,
  },
  worldHeight: {
    unit: "world units",
    meaning: "Height of the wrap-around world.",
    range: [8, 200],
    defaultValue: 32,
    phase: "init",
    integer: false,
  },
  separationWeight: {
    unit: "per second",
    meaning: "How quickly a bird steers away from neighbours inside its separation radius.",
    range: [0, 2],
    defaultValue: 1.05,
    phase: "live",
    integer: false,
  },
  alignmentWeight: {
    unit: "per second",
    meaning: "How quickly a bird matches the average velocity of the neighbours it can see.",
    range: [0, 2],
    defaultValue: 2,
    phase: "live",
    integer: false,
  },
  cohesionWeight: {
    unit: "per second",
    meaning: "How quickly a bird steers toward the centre of the neighbours it can see.",
    range: [0, 2],
    defaultValue: 0.4,
    phase: "live",
    integer: false,
  },
  perceptionRadius: {
    unit: "world units",
    meaning: "How far a bird can see; alignment and cohesion use only the birds inside it.",
    range: [0.5, 50],
    defaultValue: 9,
    phase: "live",
    integer: false,
  },
  separationRadius: {
    unit: "world units",
    meaning: "How close a neighbour must be before the bird steers away from it.",
    range: [0.1, 10],
    defaultValue: 1.55,
    phase: "live",
    integer: false,
  },
  targetSpeed: {
    unit: "world units per second",
    meaning: "The speed the steering rules aim for.",
    range: [0.1, 8],
    defaultValue: 2.7,
    phase: "live",
    integer: false,
  },
  minSpeed: {
    unit: "world units per second",
    meaning: "No bird flies slower than this.",
    range: [0.05, 4],
    defaultValue: 0.45,
    phase: "live",
    integer: false,
  },
  maxSpeed: {
    unit: "world units per second",
    meaning: "No bird flies faster than this.",
    range: [0.1, 8],
    defaultValue: 3.6,
    phase: "live",
    integer: false,
  },
  maxAcceleration: {
    unit: "world units per second²",
    meaning: "The most all the rules together can change a bird's velocity each second.",
    range: [0.1, 50],
    defaultValue: 4.6,
    phase: "live",
    integer: false,
  },
  beaconWeight: {
    unit: "per second",
    meaning: "How quickly a bird steers toward its nearest beacon.",
    range: [0, 4],
    defaultValue: 0.85,
    phase: "live",
    integer: false,
  },
  obstacleWeight: {
    unit: "per second²",
    meaning: "How hard an obstacle pushes a bird away for each world unit the bird is inside its radius.",
    range: [0, 20],
    defaultValue: 3,
    phase: "live",
    integer: false,
  },
  obstacleRadius: {
    unit: "world units",
    meaning: "How close to an obstacle a bird must be before it is pushed away.",
    range: [0.1, 10],
    defaultValue: 3.4,
    phase: "live",
    integer: false,
  },
} as const satisfies VariableTable);

export const FlockParams = z.strictObject(shapeOf(FLOCK_VARIABLES)).refine((params) => params.minSpeed < params.maxSpeed, {
  error: "minSpeed must be below maxSpeed",
  path: ["minSpeed"],
});
export type FlockParams = z.infer<typeof FlockParams>;

export const flockDefaultParams: FlockParams = Object.freeze(defaultsOf(FLOCK_VARIABLES));
