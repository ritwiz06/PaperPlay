import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SourceText, type ModelSpec } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { checkValues, evaluate, FormulaError, nextGeneration, numbersIn, parseFormula, runOwnNumbers, statedRange, symbolName } from "../src/reproduce/index.ts";
import { toModelSpec } from "../src/transcribe/convert.ts";
import { Gold } from "../src/transcribe/gold.ts";
import { TranscriptionWithSets } from "../src/transcribe/schema.ts";
import { withValueSet } from "../src/transcribe/valuesets.ts";

// Running the paper's own numbers (ADR-0040): the reproduction number from the model's own
// equations against the paper's formula, every value against its quote, and the scan for other
// values behind the headline, on the gold transcriptions of two papers.

const root = join(import.meta.dirname, "..", "..", "..");
const sourceOf = (id: string): SourceText => SourceText.parse(JSON.parse(readFileSync(join(root, "fixtures", "sources", `${id}.json`), "utf8")));
const goldModel = (id: string, set?: string): { readonly model: ModelSpec; readonly source: SourceText } => {
  const gold = Gold.parse(JSON.parse(readFileSync(join(root, "eval", "gold", `${id}.json`), "utf8")));
  const source = sourceOf(id);
  let transcription = TranscriptionWithSets.parse(gold.transcription);
  const picked = set === undefined ? undefined : transcription.valueSets?.find((candidate) => candidate.id === set);
  if (picked) transcription = { ...transcription, ...withValueSet(transcription, picked).transcription };
  const { model, problems } = toModelSpec(transcription, source);
  if (!model) throw new Error(problems.join("; "));
  return { model, source };
};
const valuesOf = (model: ModelSpec): Record<string, number> => Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));

const HCV_HEADLINE = {
  text: "The model shows that if more than 52% of patients stick to their treatment, the virus will stop spreading in the population.",
  quote: "an adherence level exceeding 52% causes the reproduction number to drop below 1, curtailing further spread.",
};

describe("[R08] a paper's own formula, read from its LaTeX", () => {
  it("names a symbol as the paper writes it, its style, variant and subscript folded", () => {
    expect(["β_{1}", "\\beta_1", "\\beta_{1}"].map(symbolName)).toEqual(["β1", "β1", "β1"]);
    expect(["ϕ", "\\phi", "\\varphi"].map(symbolName)).toEqual(["φ", "φ", "φ"]);
    expect(["\\mathscr{R}_0", "ℛ_{0}", "R_{0}"].map(symbolName)).toEqual(["R0", "R0", "R0"]);
    expect(symbolName("C_{q}")).toBe("Cq");
  });

  it("reads fractions, products written side by side, brackets and powers, each symbol resolved", () => {
    const resolve = (name: string) => ({ p: name });
    const expr = parseFormula("\\frac{b β_{1}}{μ ( μ + r )} + 2 x^{2} − \\left( a \\cdot c \\right)", resolve);
    expect(evaluate(expr, { b: 0.01, β1: 0.2, μ: 0.02, r: 0.18, x: 3, a: 2, c: 5 })).toBeCloseTo((0.01 * 0.2) / (0.02 * 0.2) + 18 - 10, 12);
    expect(evaluate(parseFormula("1.658\\times10^6", resolve), {})).toBe(1658000);
  });

  it("refuses what it does not read, naming it, and a symbol it cannot resolve", () => {
    expect(() => parseFormula("\\int_0^1 x", (name) => ({ p: name }))).toThrow(FormulaError);
    expect(() => parseFormula("\\frac{b}{q}", (name) => {
      if (name === "b") return { p: "b" };
      throw new FormulaError(`it names ${name}`);
    })).toThrow(/it names q/);
  });
});

describe("[R08] the reproduction number from the model's own equations", () => {
  it("of the hepatitis C model: three infected compartments, and the value the paper's equation (7) gives", () => {
    const { model } = goldModel("pmc-PMC12334037");
    const result = nextGeneration(model, valuesOf(model));
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.infected).toEqual(["i", "c", "cq"]);
    expect(result.value.sources).toEqual(["s"]);
    expect(result.value.dfe.s).toBeCloseTo(0.5, 12);
    // Equation (7) by hand: bβ1/(μm1) + brβ2(1−η)/(μm1m2) + rbδβ3(1−η)(1−θ)/(μm1m2m3).
    const [b, mu, v, nu, beta1, beta2, beta3, r, eta, delta, theta, rho, alpha] = [0.01, 0.02, 0.006, 0.055, 0.214, 0.016, 0.05, 0.163, 0.3, 0.6, 0.5, 0.053, 0.001];
    const [m1, m2, m3] = [mu + r, delta * (1 - theta) + mu + v + rho, alpha * rho + mu + nu];
    const paper = (b * beta1) / (mu * m1) + (b * r * beta2 * (1 - eta)) / (mu * m1 * m2) + (r * b * delta * beta3 * (1 - eta) * (1 - theta)) / (mu * m1 * m2 * m3);
    expect(result.value.r0).toBeCloseTo(paper, 12);
    expect(result.value.r0).toBeCloseTo(0.76226, 5);
  });

  it("of the tuberculosis model at its Ethiopian values, with vaccination, and refuses a model with no transmission", () => {
    const { model } = goldModel("arxiv-2506.19869v1", "ethiopia");
    const result = nextGeneration(model, valuesOf(model));
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.infected).toEqual(["e", "i"]);
    expect(result.value.r0).toBeCloseTo(33.74, 2);
    const still: ModelSpec = { ...model, equations: model.equations.map((equation) => (equation.of === "s" ? { ...equation, rate: { n: 0 } } : equation)) };
    const refused = nextGeneration(still, valuesOf(still));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.reason).toMatch(/no term moves people from one compartment to another/);
  });
});

describe("[R08] every value against its quote", () => {
  it("reads numbers as papers write them", () => {
    expect(numbersIn("$1.658\\times10^6$")).toContain(1658000);
    expect(numbersIn("$7.75\\times 10^{-7}$")).toContain(7.75e-7);
    expect(numbersIn("0.01 (0.009-0.06)")).toEqual(expect.arrayContaining([0.01, 0.009, 0.06]));
    expect(statedRange("Treatment adherence proportion | $θ$ | 0.5 (0-1) | Assumed")).toEqual([0, 1]);
  });

  it("finds every value of the two papers as written", () => {
    for (const [id, set] of [["pmc-PMC12334037", undefined], ["arxiv-2506.19869v1", "ethiopia"]] as const) {
      const { model, source } = goldModel(id, set);
      expect(checkValues(model, source).filter((entry) => entry.verdict !== "as written"), id).toEqual([]);
    }
  });

  it("flags a rate given per day and read as written into a model in years, a percentage read as a whole number, and a value in no quote", () => {
    const source = SourceText.parse({ ...sourceOf("pmc-PMC12334037"), text: "Table 2: Rates per day\nSymbol | Value\nγ | 0.1\nθ | 40%\nκ | 0.3\n\nmore" , sections: [{ id: "s", title: "S", start: 0, end: 60 }], equations: [] });
    const parameter = (id: string, quote: string, value: number, unit: Record<string, number>) => ({ id, symbol: id, name: id === "theta" ? "adherence proportion" : id, unit, range: [0, 100], defaultValue: value, origin: "paper-derived", anchors: [{ sourceId: source.sourceId, sectionId: "s", charStart: 0, charEnd: quote.length, quote }] });
    const model = { timeUnit: "year", parameters: [parameter("gamma", "γ | 0.1", 0.1, { time: -1 }), parameter("gammaYear", "γ | 0.1", 36.525, { time: -1 }), parameter("theta", "θ | 40%", 40, {}), parameter("kappa", "κ | 0.3", 0.4, {})] } as unknown as ModelSpec;
    expect(checkValues(model, source).map((entry) => [entry.id, entry.verdict, entry.note])).toEqual([
      ["gamma", "mismatch", "the paper gives it per day, the model runs per year, and it is read as written"],
      ["gammaYear", "converted", "from per day to per year"],
      ["theta", "mismatch", "a proportion above 1, 40"],
      ["kappa", "mismatch", "0.4 is not among the numbers its quote holds (0.3)"],
    ]);
  });
});

describe("[R08] running the paper's own numbers", () => {
  it("confirms the hepatitis C headline's mismatch, and says so neutrally, with the page's statements anchored", () => {
    const { model, source } = goldModel("pmc-PMC12334037");
    const check = runOwnNumbers({ source, model, headline: HCV_HEADLINE });
    expect(check.verdict).toBe("mismatch");
    expect(check.reasons).toEqual([]);
    expect(check.headline.lever).toEqual({ id: "theta", symbol: "\\theta", word: "adherence" });
    expect(check.formulas.map((formula) => [formula.name, formula.equation, formula.agrees])).toEqual([["R0", "7", true]]);
    expect(check.sweep).toMatchObject({ lever: "theta", from: 0, to: 1, crossings: [] });
    expect(check.scan.headlineFigures).toEqual(["7"]);
    expect(check.scan.otherValues).toEqual([]);
    expect(check.observation).toBe("At the values the paper lists in Table 1, R0 stays between 0.65 and 0.78 for every adherence from 0 to 1, so the 52% threshold doesn't appear here; the paper's figure may use values it doesn't list.");
    expect(check.statements.filter((statement) => statement.origin === "paper-derived").map((statement) => statement.text)).toEqual([
      `The paper's headline: "${HCV_HEADLINE.quote}"`,
      'Figure 7\'s caption says: "In this analysis, ρ and θ were varied while all other parameters were held constant as displayed in Table 1."',
    ]);
    for (const statement of check.statements) for (const anchor of statement.anchors) expect(source.text.slice(anchor.charStart, anchor.charEnd)).toBe(anchor.quote);
  });

  it("stops for the owner when a value of a headline about R0 may be misread, and says which", () => {
    const { model, source } = goldModel("pmc-PMC12334037");
    const misread: ModelSpec = { ...model, parameters: model.parameters.map((parameter) => (parameter.id === "rho" ? { ...parameter, defaultValue: 0.0053 } : parameter)) };
    const check = runOwnNumbers({ source, model: misread, headline: HCV_HEADLINE });
    expect(check.verdict).toBe("unresolved");
    expect(check.observation).toBeNull();
    expect(check.stop).toMatch(/^running the paper's own numbers points to a mistake of ours, to be fixed before a world says anything of its headline: a value may be misread: \\rho 0\.0053, 0\.0053 is not among the numbers its quote holds/);
  });

  it("finds a headline's threshold where the model shows it, and leaves a headline with none to the usual rules", () => {
    const { model, source } = goldModel("pmc-PMC12334037");
    const holds = runOwnNumbers({ source, model, headline: { text: "A recruitment rate above 1.31% makes the infection spread.", quote: "a recruitment rate above 1.31% pushes the reproduction number above 1" } });
    expect(holds.verdict).toBe("holds");
    expect(holds.sweep?.crossings[0]).toBeCloseTo(0.01312, 4);
    expect(holds.observation).toBeNull();
    const tb = goldModel("arxiv-2506.19869v1", "ethiopia");
    const none = runOwnNumbers({ source: tb.source, model: tb.model, headline: { text: "TB can be eliminated if the reproduction number is kept below one.", quote: "The results suggest that optimal conditions could lead to the elimination of TB." } });
    expect(none.verdict).toBe("not-applicable");
  });

  it("on the tuberculosis paper: both its formulas agree with the model's own equations, and its stated R0 follows from neither", () => {
    const { model, source } = goldModel("arxiv-2506.19869v1", "ethiopia");
    const check = runOwnNumbers({ source, model, headline: { text: "TB can be eliminated.", quote: "The results suggest that optimal conditions could lead to the elimination of TB." } });
    expect(check.formulas.map((formula) => [formula.name, formula.equation, formula.agrees, formula.zeroed])).toEqual([
      ["Rv", "9", true, []],
      ["R0", "10", true, ["eta", "theta", "pi", "alpha", "omega"]],
    ]);
    expect(check.formulas[1]?.value).toBeCloseTo(80.39, 2);
    expect(check.stated.map((entry) => [entry.name, entry.value, entry.agrees])).toEqual([["R0", 2.67, false]]);
    expect(check.statements.map((statement) => statement.text)).toContain("The paper states R0 = 2.67; at the values it lists, its formula gives 80.4, so the stated value may rest on values it doesn't list.");
  });
});
