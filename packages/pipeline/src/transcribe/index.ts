/**
 * @paperplay/pipeline/transcribe: a compartment model as a transcriber writes it, its formulas
 * parsed by the closed grammar, its quotes made anchors, and two transcriptions compared up to
 * renaming (ADR-0024, item 2).
 */
export { anchorOf, camelId, findQuote, idsFor, toModelSpec, type Conversion } from "./convert.ts";
export { FormulaError, formulaOf, parseFormula, tokenize } from "./formula.ts";
export { Gold } from "./gold.ts";
export { matchModels, normalName, type ModelMatch } from "./match.ts";
export { Transcription, TranscribedUnit } from "./schema.ts";
export { modelForComparison, scoreReading, scoreTranscription, type ReadingScore, type TranscriptionScore } from "./score.ts";
