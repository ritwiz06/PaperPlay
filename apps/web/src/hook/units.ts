/**
 * Every number in the unit the chart shows (ADR-0042). A world whose compartments are shares of a
 * population shows them as people in a stated town (ADR-0037); its claims and its guide's
 * readings are written so too, never in the model's shares.
 */
export interface DisplayScale {
  readonly factor: number;
  readonly unit: string;
}

/** A share as people: 0.004 in a town of 10,000 is "40 people". */
export const asPeople = (value: number, scale: DisplayScale): string => `${Math.round(value * scale.factor).toLocaleString("en-GB")} ${scale.unit}`;

/** A sentence's shares written as people: every number with a decimal point no greater than one, "above 0.01" as "above 100 people". */
export function inDisplayUnits(text: string, scale: DisplayScale | null): string {
  if (!scale) return text;
  return text.replace(/(?<![\d.])(0?\.\d+|1\.0+)(?!\d|\.\d)(\s*%)?/g, (whole, number: string, percent: string | undefined) => (percent ? whole : asPeople(Number(number), scale)));
}

/** A level's claim, from its data, in the chart's unit: "Highest recovered within 200 years: the other world higher by more than 40 people." */
export function claimWords(label: string, claim: { readonly relation: string; readonly by: number }, scale: DisplayScale): string {
  return `${label}: the other world ${claim.relation} by more than ${asPeople(claim.by, scale)}.`;
}
