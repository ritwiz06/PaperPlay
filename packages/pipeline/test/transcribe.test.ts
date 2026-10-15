import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SourceText, type ModelSpec } from "@paperplay/contracts";
import { compartmentModel } from "@paperplay/primitives/compartments";
import { describe, expect, it } from "vitest";
import { anchorOf, camelId, findQuote, idsFor, toModelSpec } from "../src/transcribe/convert.ts";
import { Gold } from "../src/transcribe/gold.ts";
import { FormulaError, formulaOf, parseFormula } from "../src/transcribe/formula.ts";
import { matchModels } from "../src/transcribe/match.ts";
import { Transcription } from "../src/transcribe/schema.ts";

// Transcription (ADR-0024, item 2): a model as a transcriber writes it, parsed by the closed
// grammar, anchored by quotes found in the source, and compared with a second transcription up
// to renaming. The gold answers for the three open-access papers are held to all of it.

const root = join(import.meta.dirname, "..", "..", "..");
const GOLD = ["arxiv-2506.19869v1", "arxiv-2203.01434v2", "pmc-PMC12334037"] as const;
const goldOf = (id: string) => {
  const gold = Gold.parse(JSON.parse(readFileSync(join(root, "eval", "gold", `${id}.json`), "utf8")));
  const source = SourceText.parse(JSON.parse(readFileSync(join(root, "fixtures", "sources", `${id}.json`), "utf8")));
  expect(gold.modelEquations.every((equation) => source.equations.some((candidate) => candidate.id === equation))).toBe(true);
  return { transcription: Transcription.parse(gold.transcription), source };
};
const names = { compartments: new Set(["S", "I", "R"]), parameters: new Set(["beta", "gamma", "N"]) };

describe("[R08] the formula grammar", () => {
  it("parses rates as the closed expression tree, with precedence, juxtaposition and unary minus", () => {
    expect(parseFormula("-beta*S*I/N", names)).toEqual({ op: "div", a: { op: "mul", args: [{ op: "neg", a: { p: "beta" } }, { c: "S" }, { c: "I" }] }, b: { p: "N" } });
    expect(parseFormula("beta S I - gamma I", names)).toEqual({ op: "sub", a: { op: "mul", args: [{ p: "beta" }, { c: "S" }, { c: "I" }] }, b: { op: "mul", args: [{ p: "gamma" }, { c: "I" }] } });
    expect(parseFormula("S^2 + exp(-gamma) − 1.5e-3", names)).toEqual({
      op: "sub",
      a: { op: "add", args: [{ op: "pow", a: { c: "S" }, b: { n: 2 } }, { op: "exp", a: { op: "neg", a: { p: "gamma" } } }] },
      b: { n: 0.0015 },
    });
    expect(formulaOf(parseFormula("beta*S*I - gamma*I", names))).toBe("beta*S*I - gamma*I");
  });

  it("refuses an unknown name, a stray character, and anything after a complete formula, saying where", () => {
    expect(() => parseFormula("beta*S*X", names)).toThrow(/"X" is neither a compartment nor a parameter/);
    expect(() => parseFormula("beta*S;I", names)).toThrow(FormulaError);
    expect(() => parseFormula("(beta*S", names)).toThrow(/expected "\)"/);
    expect(() => parseFormula("beta S )", names)).toThrow(/after a complete formula/);
  });
});

describe("[R05] quotes as anchors", () => {
  it("finds a quote exactly, or with its whitespace differing, and never one the text does not hold", () => {
    expect(findQuote("The rate is  \\beta = 0.05, and", "\\beta = 0.05")).toEqual({ start: 13, end: 25 });
    expect(findQuote("dS/dt =\n  -beta S I", "dS/dt = -beta S I")).toEqual({ start: 0, end: 19 });
    expect(findQuote("The rate is 0.05", "0.06")).toBeNull();
  });

  it("finds a quote written in another notation, and anchors the source's own LaTeX, never the model's rendering", () => {
    const text = "the system\n\\frac{dS}{dt} &= \\Lambda - (\\beta I + \\mu)S \\\\\nwith $\\beta = 0.05$ and $N_0 = 5\\times 10^{8}$; then m_T \\coloneqq 5 \\cdot 10^{-15}\; cells";
    const span = (quote: string) => {
      const found = findQuote(text, quote);
      return found && text.slice(found.start, found.end);
    };
    expect(span("dS/dt = Λ - (βI + μ)S")).toBe("\\frac{dS}{dt} &= \\Lambda - (\\beta I + \\mu)S");
    expect(span("β = 0.05")).toBe("\\beta = 0.05");
    expect(span("beta = 0.05")).toBe("\\beta = 0.05");
    expect(span("N_0 = 5 × 10^8")).toBe("N_0 = 5\\times 10^{8}");
    expect(span("m_T := 5 * 10^{-15}")).toBe("m_T \\coloneqq 5 \\cdot 10^{-15}");
    // A changed number or term is not there, and a short quote never matches by notation alone.
    expect(span("dS/dt = Λ - (βI + 2μ)S")).toBeNull();
    expect(span("β = 0.06")).toBeNull();
    expect(span("βI")).toBeNull();
  });

  it("makes each paper name a distinct camelCase id", () => {
    expect(["S", "C_q", "Cq", "theta_N", "beta1"].map(camelId)).toEqual(["s", "cQ", "cq", "thetaN", "beta1"]);
    expect([...idsFor(["B", "b", "R", "r"]).values()]).toEqual(["b", "b2", "r", "r2"]);
  });
});

describe("[R08] the gold transcriptions of three open-access papers", () => {
  for (const id of GOLD) {
    it(`${id}: every quote is in the source, every formula parses, the units agree, and the model runs`, () => {
      const { transcription, source } = goldOf(id);
      const { model, problems, unstated } = toModelSpec(transcription, source);
      expect(problems).toEqual([]);
      expect(unstated).toEqual([]);
      if (!model) throw new Error("no model");
      for (const item of [...model.compartments, ...model.parameters, ...model.equations]) {
        for (const anchor of item.anchors) {
          if ("placeholder" in anchor) throw new Error("a placeholder in a gold answer");
          expect(source.text.slice(anchor.charStart, anchor.charEnd)).toBe(anchor.quote);
        }
      }
      const primitive = compartmentModel(model);
      const params = Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
      let state = primitive.init(params, 0);
      for (let step = 0; step < 1000; step++) state = primitive.step(state, params, model.solver.dt);
      for (const value of Object.values(state.compartments)) expect(Number.isFinite(value) && value >= -1e-9).toBe(true);
    });
  }

  it("refuses a quote the source does not hold, naming it", () => {
    const { transcription, source } = goldOf("arxiv-2506.19869v1");
    const forged = { ...transcription, parameters: transcription.parameters.map((parameter) => (parameter.id === "beta" ? { ...parameter, quote: "\\beta = 0.07" } : parameter)) };
    expect(toModelSpec(forged, source).problems).toEqual(['parameter beta: the quote "\\beta = 0.07" is not in the source']);
    expect(anchorOf(source, "\\beta = 0.05")?.sectionId).toBe("s20-synthetic-example-case");
  });
});

describe("[R10] two transcriptions compared up to renaming", () => {
  const gold = (): ModelSpec => {
    const { transcription, source } = goldOf("pmc-PMC12334037");
    const { model } = toModelSpec(transcription, source);
    if (!model) throw new Error("no model");
    return model;
  };
  /** The same model with every name changed and its lists reordered, as a second transcriber might write it. */
  const renamedCopy = (): ModelSpec => {
    const { transcription, source } = goldOf("pmc-PMC12334037");
    const rename = (name: string) => `x${name}`;
    const renamed = {
      ...transcription,
      compartments: [...transcription.compartments].reverse().map((compartment) => ({ ...compartment, id: rename(compartment.id), name: `${compartment.name} (again)` })),
      parameters: [...transcription.parameters].reverse().map((parameter) => ({ ...parameter, id: rename(parameter.id) })),
      equations: transcription.equations.map((equation) => ({ ...equation, of: rename(equation.of), rate: equation.rate.replace(/[A-Za-z][A-Za-z0-9_]*/g, (name) => rename(name)) })),
    };
    const { model } = toModelSpec(renamed, source);
    if (!model) throw new Error("no model");
    return model;
  };

  it("agrees with itself renamed and reordered, pairing every name", () => {
    const match = matchModels(gold(), renamedCopy());
    expect(match).toMatchObject({ structural: true, values: true, problems: [] });
    expect(match.compartments.cq).toBe("xCq");
    expect(match.parameters.beta1).toBe("xbeta1");
  });

  it("finds a changed rate, and a value read differently, apart", () => {
    const a = gold();
    const changed: ModelSpec = { ...a, equations: a.equations.map((equation) => (equation.of === "c" ? { ...equation, rate: { op: "neg", a: equation.rate } } : equation)) };
    expect(matchModels(a, changed)).toMatchObject({ structural: false, problems: ["dc/dt and dc/dt differ"] });
    const misread: ModelSpec = { ...a, parameters: a.parameters.map((parameter) => (parameter.id === "rho" ? { ...parameter, defaultValue: 0.0053, range: [0, 1] } : parameter)) };
    expect(matchModels(a, misread)).toMatchObject({ structural: true, values: false, problems: ["rho is 0.053 in the first and 0.0053 in the second"] });
  });

  it("refuses models with different numbers of compartments", () => {
    const a = gold();
    expect(matchModels(a, { ...a, compartments: a.compartments.slice(1), equations: a.equations.slice(1), observables: a.observables.slice(1) }).problems).toEqual(["the first has 5 compartments, the second 4"]);
  });
});
