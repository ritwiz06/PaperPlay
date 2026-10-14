/**
 * A transcription: a compartment model as a transcriber writes it down from a paper (ADR-0024,
 * item 2). Rates are formulas, parsed by our own closed grammar; every compartment, parameter and
 * equation carries a short verbatim quote from the source, which is found in the source's text to
 * become a real anchor. A transcriber never invents a value: one the paper does not state is null,
 * and says so. The gold answers are written in the same form.
 */
import { TimeUnit } from "@paperplay/contracts";
import { z } from "zod";

const Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "a plain name: a letter, then letters, digits or underscores");
const Quote = z.string().min(3).max(300);

/** A unit as whole-number powers of the family's dimensions, as ModelSpec writes it (ADR-0028). */
export const TranscribedUnit = z.strictObject({
  people: z.int().min(-4).max(4).optional(),
  cells: z.int().min(-4).max(4).optional(),
  molecules: z.int().min(-4).max(4).optional(),
  length: z.int().min(-4).max(4).optional(),
  mass: z.int().min(-4).max(4).optional(),
  time: z.int().min(-4).max(4).optional(),
});

export const Transcription = z.strictObject({
  /** The unit the paper's rates are per: day, week, year… */
  timeUnit: TimeUnit,
  compartments: z
    .array(
      z.strictObject({
        id: Name,
        /** As the paper writes it: "S", "C_q", "\\theta_N". */
        symbol: z.string().min(1),
        name: z.string().min(1),
        unit: TranscribedUnit,
        /** Its value at the start, as the paper states it, or null where it states none. */
        initial: z.number().nullable(),
        /** Where the paper states the starting value, verbatim; null with the value. */
        initialQuote: Quote.nullable(),
        /** Where the paper names the compartment, verbatim. */
        quote: Quote,
      }),
    )
    .min(1)
    .max(24),
  parameters: z
    .array(
      z.strictObject({
        id: Name,
        symbol: z.string().min(1),
        name: z.string().min(1),
        unit: TranscribedUnit,
        /** Its value, as the paper states it, or null where it states none. */
        value: z.number().nullable(),
        /** Where the paper states the value, verbatim; where it states none, where it names the parameter. */
        quote: Quote,
      }),
    )
    .max(32),
  /** One per compartment: d(compartment)/dt = rate. */
  equations: z.array(
    z.strictObject({
      of: Name,
      /** The rate as a formula over the ids above: numbers, + - * / ^, brackets, exp and log. */
      rate: z.string().min(1).max(600),
      /** Part of the paper's own equation for it, verbatim. */
      quote: Quote,
    }),
  ),
});
export type Transcription = z.infer<typeof Transcription>;
