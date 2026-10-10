import { z } from "zod";

/** The unit a model's time is measured in: a step, a level's time and every summary of it are counted in it. */
export const TimeUnit = z.enum(["second", "minute", "hour", "day", "week", "year"]);
export type TimeUnit = z.infer<typeof TimeUnit>;
