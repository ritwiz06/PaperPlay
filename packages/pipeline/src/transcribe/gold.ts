/**
 * A gold answer (eval/gold/<sourceId>.json): a paper's model as a careful human transcribed it, in
 * the same form a transcriber writes, with the equations that define it, values the paper also
 * states for another scenario, and the qualitative result it shows. The bake-off scores against it.
 */
import { z } from "zod";
import { TranscriptionWithSets } from "./schema.ts";

export const Gold = z.strictObject({
  schemaVersion: z.literal("gold/1"),
  sourceId: z.string().min(1),
  transcribedBy: z.string().min(1),
  notes: z.array(z.string().min(1)),
  /** The source's equation ids that define the model. */
  modelEquations: z.array(z.string().min(1)).min(1),
  /** Other values the paper states for a parameter or a starting value, by the transcription's id, each counted right. */
  acceptableValues: z.record(z.string(), z.array(z.number()).min(1)),
  /** When the paper states several value sets: the one the value-set rule should pick, by its id in the transcription's valueSets. */
  picked: z.string().min(1).optional(),
  transcription: TranscriptionWithSets,
  qualitative: z.strictObject({ text: z.string().min(1), quote: z.string().min(3).max(300) }),
});
export type Gold = z.infer<typeof Gold>;
