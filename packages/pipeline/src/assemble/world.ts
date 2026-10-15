/**
 * The assembler: a plan, its words and the verified model as a worldspec/3 for the builder, by rule
 * and never by a model. Every quote is looked up in the source: one it holds becomes a real anchor
 * and its statement is the paper's; one it does not hold is dropped, and its statement becomes a
 * teaching choice, noted. Numbers the planner did not state (ranges, slider steps, decimals) are
 * teaching choices made here. The builder then checks everything against the solver, and the level
 * rule sweeps every What-if.
 */
import { TIME_WORDS, type Anchor, type ModelSpec, type SourceRegisterEntry, type SourceText } from "@paperplay/contracts";
import { formatUnit } from "@paperplay/primitives/compartments";
import { chooseStep, defaultsOf } from "./model.ts";
import type { Explanation, ExplainedLevel } from "../stages/explainer.ts";
import type { Plan, PlanLevel } from "../stages/planner.ts";
import type { Reading } from "../stages/reader.ts";
import { anchorOf, camelId, sameSymbol } from "../transcribe/convert.ts";

export interface AssembleInput {
  readonly source: SourceText;
  readonly register: SourceRegisterEntry;
  readonly reading: Reading;
  readonly model: ModelSpec;
  readonly plan: Plan;
  readonly explanation: Explanation;
  readonly routingReason: string;
}

export interface Assembled {
  /** The WorldSpec, for the builder to check. */
  readonly spec: Record<string, unknown>;
  /** What became a teaching choice because its quote was not in the source. */
  readonly notes: readonly string[];
}

const ELEMENTS = ["control-value", "range-numbers", "range-words", "readout-number", "equation", "analogy"] as const;
const variant = (show: readonly string[]) => ({ show: [...show], hide: ELEMENTS.filter((element) => !show.includes(element)) });
const kebab = (id: string): string => id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const figure = (value: number): string => String(Number(value.toPrecision(4)));

/**
 * A plan's names as the model's ids. A planner may name a parameter or a compartment as the paper
 * writes it, "theta_N" or "S", where the model's id is "thetaN" or "s": the id, its camelCase form,
 * or the paper's symbol in any notation, in that order. A name none of these finds is left as it
 * is, and the builder says it is unknown.
 */
export function namedInModel(plan: Plan, model: ModelSpec): Plan {
  const resolve = (name: string, pool: readonly { readonly id: string; readonly symbol?: string }[]): string =>
    pool.find((entry) => entry.id === name)?.id ?? pool.find((entry) => entry.id === camelId(name))?.id ?? pool.find((entry) => entry.symbol !== undefined && sameSymbol(entry.symbol, name))?.id ?? name;
  return {
    ...plan,
    levels: plan.levels.map((level) => ({
      ...level,
      control: { ...level.control, parameter: resolve(level.control.parameter, model.parameters) },
      whatIf: { ...level.whatIf, parameter: resolve(level.whatIf.parameter, model.parameters) },
      watch: resolve(level.watch, model.compartments),
      difference: { ...level.difference, compartment: resolve(level.difference.compartment, model.compartments) },
    })),
  };
}

/**
 * The model with the finest step any level needs: the step chosen at the paper's values can be too
 * coarse for a What-if's, which the builder's accuracy check would then refuse. Each level's two
 * worlds are checked over its time; a level no step serves is left for the builder to refuse.
 */
export function steppedFor(model: ModelSpec, plan: Plan): ModelSpec {
  const defaults = defaultsOf(model);
  let dt = model.solver.dt;
  for (const level of plan.levels) {
    for (const params of [defaults, { ...defaults, [level.whatIf.parameter]: level.whatIf.value }]) {
      const step = chooseStep(model, level.difference.time, params);
      if (step !== null && step < dt) dt = step;
    }
  }
  return dt === model.solver.dt ? model : { ...model, solver: { ...model.solver, dt } };
}

export function assembleWorld(input: AssembleInput): Assembled {
  const { source, explanation, reading } = input;
  const plan = namedInModel(input.plan, input.model);
  const model = steppedFor(input.model, plan);
  const notes: string[] = [];
  const time = TIME_WORDS[model.timeUnit];
  const anchored = (quote: string | null | undefined, what: string): Anchor[] => {
    if (!quote) return [];
    const found = anchorOf(source, quote);
    if (!found) notes.push(`${what}: its quote is not in the source, so it is a teaching choice`);
    return found ? [found] : [];
  };
  const origin = (anchors: readonly Anchor[]) => (anchors.length > 0 ? "paper-derived" : "teaching-choice");
  const parameterOf = (id: string) => model.parameters.find((parameter) => parameter.id === id);
  const compartmentOf = (id: string) => model.compartments.find((compartment) => compartment.id === id);
  const observableOf = (compartment: string) => model.observables.find((observable) => "c" in observable.expr && observable.expr.c === compartment)?.id ?? compartment;
  const unitOf = (id: string): string => {
    const parameter = parameterOf(id);
    const compartment = compartmentOf(id);
    return parameter ? formatUnit(parameter.unit, model.timeUnit) : compartment ? formatUnit(compartment.unit, model.timeUnit) : "dimensionless";
  };
  // How big each compartment gets at the start, for decimals and the guide's trend.
  const scale = Math.max(...model.parameters.filter((parameter) => parameter.id.endsWith("0")).map((parameter) => Math.abs(parameter.defaultValue)), 1e-12);
  const decimals = scale >= 100 ? 0 : scale >= 1 ? 1 : 3;

  const level = (planned: PlanLevel, words: ExplainedLevel | undefined, index: number) => {
    const id = index === 0 ? "hook" : `level-${index + 1}`;
    const control = parameterOf(planned.control.parameter);
    const value = control?.defaultValue ?? 0;
    const [low, high] = value > 0 ? [value / 4, value * 4] : [0, 1];
    const step = Number(((high - low) / 150).toPrecision(2));
    const watched = compartmentOf(planned.watch);
    const measured = compartmentOf(planned.difference.compartment);
    const summaryOf = () => {
      const at = planned.difference.at ?? 0;
      switch (planned.difference.summary) {
        case "at":
          return { summary: { kind: "at", time: at }, label: `${measured?.name ?? planned.difference.compartment} at ${time.one} ${figure(at)}`, unit: unitOf(planned.difference.compartment) };
        case "first-reach":
          return { summary: { kind: "first-reach", threshold: at }, label: `${time.many.charAt(0).toUpperCase()}${time.many.slice(1)} until ${measured?.name.toLowerCase() ?? planned.difference.compartment} first reaches ${figure(at)}`, unit: time.many };
        case "lowest":
          return { summary: { kind: "lowest", from: at }, label: `Lowest ${measured?.name.toLowerCase() ?? planned.difference.compartment} from ${time.one} ${figure(at)}`, unit: unitOf(planned.difference.compartment) };
        case "total":
          return { summary: { kind: "total" }, label: `${measured?.name ?? planned.difference.compartment} summed over ${figure(planned.difference.time)} ${time.many}`, unit: `${unitOf(planned.difference.compartment)} × ${time.many}` };
      }
    };
    const { summary, label, unit } = summaryOf();
    const passage = anchored(planned.passage?.quote, `level ${index + 1}'s passage`);
    const advancedAnchors = anchored(words?.advanced.quote, `level ${index + 1}'s equation`);
    const afterAnchors = anchored(words?.afterwards.quote, `level ${index + 1}'s closing line`);
    const readings = [...(words?.guide.readings ?? [{ atLeast: 0, words: "as measured" }])].sort((a, b) => b.atLeast - a.atLeast).filter((reading, at, all) => at === 0 || reading.atLeast < (all[at - 1]?.atLeast ?? Infinity));
    return {
      id,
      order: index + 1,
      kind: index === 0 ? "hook" : planned.kind === "hook" ? "idea" : planned.kind,
      title: planned.title,
      goal: planned.goal,
      bonus: false,
      binding: { type: "equations", solver: { id: "compartments.ode", version: "1.0.0" }, model, params: {}, perWatchSecond: plan.perWatchSecond },
      manipulable: {
        actionId: kebab(planned.control.parameter),
        label: planned.control.label,
        targetVariable: planned.control.parameter,
        range: [low, high],
        unit: unitOf(planned.control.parameter),
        defaultValue: value,
        origin: control?.origin ?? "teaching-choice",
        anchors: control?.anchors ?? [],
      },
      slider: { step: step > 0 ? step : 0.01, ends: [planned.control.lowEnd, planned.control.highEnd] },
      observable: { metricId: observableOf(planned.watch), label: watched?.name ?? planned.watch, shortLabel: watched?.name ?? planned.watch, unit: unitOf(planned.watch), decimals, origin: "computed-observation" },
      counterfactual: {
        prompt: planned.whatIf.prompt,
        altParams: { [planned.whatIf.parameter]: planned.whatIf.value },
        expectedQualitativeEffect: planned.effect,
        origin: "teaching-choice",
        isSpeculative: false,
        anchors: [],
        difference: { metricId: observableOf(planned.difference.compartment), label, unit, summary, time: planned.difference.time, claim: { kind: "each", relation: planned.difference.relation, by: planned.difference.by } },
      },
      setup: [],
      explanation: {
        beginner: { text: words?.beginner.text ?? planned.goal, ...variant(["range-words", "analogy"]), analogy: words?.beginner.analogy ?? planned.goal, origin: "teaching-choice", anchors: [] },
        intermediate: { text: words?.intermediate.text ?? planned.goal, ...variant(["control-value", "range-numbers", "readout-number"]), origin: "teaching-choice", anchors: [] },
        advanced: { text: words?.advanced.text ?? planned.goal, ...variant(["control-value", "range-numbers", "readout-number", "equation"]), equation: words?.advanced.equation ?? "—", origin: origin(advancedAnchors), anchors: advancedAnchors },
      },
      caption: { text: planned.passage?.title ?? planned.title, origin: origin(passage), anchors: passage },
      guide: {
        idle: words?.guide.idle ?? planned.goal,
        raised: words?.guide.raised ?? "You raised it{to}.",
        lowered: words?.guide.lowered ?? "You lowered it{to}.",
        readings,
        trend: { rising: { beginner: words?.guide.rising ?? "and rising", measured: "rising" }, falling: { beginner: words?.guide.falling ?? "and falling", measured: "falling" }, steady: "holding", within: Number((scale / 200).toPrecision(2)) },
      },
      guidedExploration: {
        predictPrompt: planned.prediction.prompt,
        choices: [planned.prediction.claimed, planned.prediction.other],
        interveneActionId: kebab(planned.control.parameter),
        observeMetricId: observableOf(planned.watch),
        explainPrompt: words?.afterwards.question ?? "Why?",
        explanation: { text: words?.afterwards.text ?? planned.effect, origin: origin(afterAnchors), anchors: afterAnchors },
      },
      furtherReading: [],
      carryForward: planned.carryForward,
    };
  };

  const levels = plan.levels.map((planned, index) => level(planned, explanation.levels[index], index));
  const resultAnchors = anchored(reading.result.quote, "the paper's result");
  const claims = reading.claims.map((claim, index) => {
    const anchors = anchored(claim.quote, `claim ${index + 1}`);
    return { id: `c${index + 1}`, claim: claim.text, dependsOn: [], anchors, origin: origin(anchors) };
  });
  const front = source.sections[0];
  const spec = {
    schemaVersion: "worldspec/3",
    status: "draft",
    title: plan.title,
    source: {
      schemaVersion: "sourcemanifest/1",
      sourceId: source.sourceId,
      title: input.register.title,
      authors: input.register.authors,
      year: input.register.year ?? 2000,
      ...(input.register.venue ? { venue: input.register.venue } : {}),
      sha256: input.register.sha256,
      accessedAt: input.register.accessedAt,
      localCopyPermitted: input.register.textKept,
      sections: source.sections.map((section) => ({ id: section.id, title: section.title })),
    },
    digest: {
      question: reading.question,
      // The hook's result is the paper's, so it must be anchored; if its quote is missing, its title stands in, and it is noted.
      hookResult: { text: reading.result.text, anchors: resultAnchors.length > 0 ? resultAnchors : front ? [anchorOf(source, source.text.slice(front.start, Math.min(front.end, front.start + 120)).trim())].filter((anchor): anchor is Anchor => anchor !== null) : [] },
      causalChain: claims,
    },
    routing: { tier: "A", family: "compartments", reason: input.routingReason, primitive: { status: "released" } },
    design: { world: "town", palette: "cream-teal", density: "comfortable", sections: levels.map((entry) => ({ levelId: entry.id, chartType: "line", motion: "none" })) },
    timeUnit: model.timeUnit,
    openingSeed: 0,
    levels,
    primitivesUsed: [{ id: "compartments.ode", version: "1.0.0" }],
    checks: {
      suiteIds: ["worldspec-schema", "builder-bindings", "compartment-checks", "level-rule", "provenance"],
      suiteVersions: { "worldspec-schema": "worldspec/3", "builder-bindings": "1", "compartment-checks": "1", "level-rule": "1", provenance: "1" },
    },
    limits: [
      { text: "A world generated from the paper by PaperPlay's pipeline, checked by its builder and its level rule; the levels, their words and their values are teaching choices, and the model is the paper's as transcribed.", origin: "teaching-choice", anchors: [] },
      ...plan.limits.map((text) => ({ text, origin: "teaching-choice", anchors: [] })),
      { text: "A draft until the owner reviews it.", origin: "teaching-choice", anchors: [] },
    ],
  };
  return { spec, notes };
}
