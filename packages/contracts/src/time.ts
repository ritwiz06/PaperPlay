import { z } from "zod";

/** The unit a model's time is measured in: a step, a level's time and every summary of it are counted in it. */
/** "step" is a learning toy's: one update of its optimizer (ADR-0047). */
export const TimeUnit = z.enum(["second", "minute", "hour", "day", "week", "year", "step"]);
export type TimeUnit = z.infer<typeof TimeUnit>;

/** The units a model of the world, such as a compartment model, counts its time in: every unit but a learning toy's step. */
export const ModelTimeUnit = TimeUnit.exclude(["step"]);
export type ModelTimeUnit = z.infer<typeof ModelTimeUnit>;

/** Each time unit in words: one, many, and as an axis writes it. */
export const TIME_WORDS: Readonly<Record<TimeUnit, { readonly one: string; readonly many: string; readonly short: string }>> = Object.freeze({
  second: Object.freeze({ one: "second", many: "seconds", short: "s" }),
  minute: Object.freeze({ one: "minute", many: "minutes", short: "min" }),
  hour: Object.freeze({ one: "hour", many: "hours", short: "h" }),
  day: Object.freeze({ one: "day", many: "days", short: "d" }),
  week: Object.freeze({ one: "week", many: "weeks", short: "wk" }),
  year: Object.freeze({ one: "year", many: "years", short: "yr" }),
  step: Object.freeze({ one: "step", many: "steps", short: "steps" }),
});
