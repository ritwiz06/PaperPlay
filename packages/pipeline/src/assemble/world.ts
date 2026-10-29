/**
 * The assembler: a plan, its words and the verified model as a worldspec/3 for the builder, by rule
 * and never by a model. Every quote is looked up in the source: one it holds becomes a real anchor
 * and its statement is the paper's; one it does not hold is dropped, and its statement becomes a
 * teaching choice, noted. Numbers the planner did not state (ranges, slider steps, decimals) are
 * teaching choices made here. The builder then checks everything against the solver, and the level
 * rule sweeps every What-if.
 */
import { GENERATED_MODEL_LABEL, mechanismRef, RULE_FASTEST_SPEED, RULE_WATCH_SECONDS, TIME_WORDS, type Anchor, type AnchorRef, type MechanismManifest, type ModelSpec, type Origin, type SourceRegisterEntry, type SourceText, type TimeUnit } from "@paperplay/contracts";
import { formatUnit } from "@paperplay/primitives/compartments";
import { chooseStep, defaultsOf } from "./model.ts";
import type { Explanation, ExplainedLevel } from "../stages/explainer.ts";
import type { Plan, PlanLevel } from "../stages/planner.ts";
import type { ReproducibilityCheck } from "../reproduce/index.ts";
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
  /** The paper's own numbers, run again (ADR-0040): the journal's page, and level 1's observation when the headline's mismatch is confirmed. */
  readonly ownNumbers?: Pick<ReproducibilityCheck, "verdict" | "statements" | "observation">;
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
 * writes it, "theta_N" or "S", where the model's id is "thetaN" or "s": the id, its camelCase form
 * in any case, or the paper's symbol in any notation, in that order; then, for a name written as
 * words, an id in brackets within it, or a compartment's or parameter's name it holds. A name none
 * of these finds is left as it is, and the builder says it is unknown.
 */
export function namedInModel(plan: Plan, model: ModelSpec): Plan {
  const exactly = (name: string, pool: readonly { readonly id: string; readonly symbol?: string }[]): string | undefined =>
    pool.find((entry) => entry.id === name)?.id ??
    pool.find((entry) => entry.id === camelId(name))?.id ??
    pool.find((entry) => entry.id.toLowerCase() === camelId(name).toLowerCase())?.id ??
    pool.find((entry) => entry.symbol !== undefined && sameSymbol(entry.symbol, name))?.id;
  // Last, a name written as words, "susceptible (s) at the end": an id in brackets, then a name it holds.
  const resolve = (name: string, pool: readonly { readonly id: string; readonly name: string; readonly symbol?: string }[]): string =>
    exactly(name, pool) ??
    [...name.matchAll(/\(([^()\s]{1,24})\)/g)].map((match) => exactly(match[1] ?? "", pool)).find(Boolean) ??
    pool.find((entry) => name.toLowerCase().includes(entry.name.toLowerCase()))?.id ??
    name;
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
/**
 * The model with each parameter's range widened to take in the values the levels' What-ifs set:
 * a range is a teaching choice made at conversion, four times the paper's value, which the planner
 * is not shown; a What-if beyond it is the planner's to choose, and the level rule's to check.
 */
export function rangedFor(model: ModelSpec, plan: Plan): ModelSpec {
  const wanted = new Map<string, number[]>();
  for (const level of plan.levels) wanted.set(level.whatIf.parameter, [...(wanted.get(level.whatIf.parameter) ?? []), level.whatIf.value]);
  return {
    ...model,
    parameters: model.parameters.map((parameter) => {
      const values = wanted.get(parameter.id);
      if (!values) return parameter;
      const low = Math.min(parameter.range[0], ...values);
      const high = Math.max(parameter.range[1], ...values);
      return low === parameter.range[0] && high === parameter.range[1] ? parameter : { ...parameter, range: [low, high === low ? low + 1 : high] as [number, number] };
    }),
  };
}

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

/** A round number at or above `value`: 1, 2 or 5 times a power of ten. */
function roundUp(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= value * (1 - 1e-12)) return factor * power;
  return 10 * power;
}

/**
 * A closing line's own words, the paper's quote taken out: a sentence that quotes the paper, or
 * says "the paper says" and quotes it, becomes the paper's own statement (ADR-0042).
 */
export function narrationOf(text: string, quote: string | null): string {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["'”’]?|$)\s*/g) ?? [text];
  const head = quote ? quote.slice(0, 24).toLowerCase() : null;
  return sentences
    .filter((sentence) => !(head && sentence.toLowerCase().includes(head)) && !/\bthe (paper|authors?) (says?|states?|writes?|notes?|reports?|finds?|concludes?)\b[^.]*["'“‘]/i.test(sentence))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What the assembler reads of the model a world runs (ADR-0058): its parameters and the quantities
 * it measures, by id, with their names and units; each control's range; the binding, the routing,
 * the kit and the checks that come with it. A compartment model and a generated mechanism each give
 * one, so every level is put together the same way.
 */
interface ModelView {
  readonly timeUnit: TimeUnit;
  parameter(id: string): { readonly name: string; readonly unit: string; readonly defaultValue: number; readonly origin: Origin; readonly anchors: readonly AnchorRef[]; readonly integer: boolean; readonly range: readonly [number, number] } | undefined;
  quantity(id: string): { readonly name: string; readonly unit: string } | undefined;
  observableOf(id: string): string;
  /** How big the model's quantities get, for decimals and the guide's trend. */
  readonly scale: number;
  binding(perWatchSecond: number): Record<string, unknown>;
  readonly routing: Record<string, unknown>;
  readonly kit: string;
  readonly openingSeed: number;
  readonly primitivesUsed: readonly { readonly id: string; readonly version: string }[];
  readonly suites: Readonly<Record<string, string>>;
  /** The first thing the world says it cannot show: how it was made. */
  readonly made: string;
}

export function assembleWorld(input: AssembleInput): Assembled {
  const plan = namedInModel(input.plan, input.model);
  const model = steppedFor(rangedFor(input.model, plan), plan);
  const parameterOf = (id: string) => model.parameters.find((parameter) => parameter.id === id);
  const compartmentOf = (id: string) => model.compartments.find((compartment) => compartment.id === id);
  const view: ModelView = {
    timeUnit: model.timeUnit,
    parameter: (id) => {
      const parameter = parameterOf(id);
      if (!parameter) return undefined;
      // A control's range is a teaching choice: a quarter to four times the paper's value.
      const value = parameter.defaultValue;
      return { name: parameter.name, unit: formatUnit(parameter.unit, model.timeUnit), defaultValue: value, origin: parameter.origin, anchors: parameter.anchors, integer: false, range: value > 0 ? [value / 4, value * 4] : [0, 1] };
    },
    quantity: (id) => {
      const compartment = compartmentOf(id);
      return compartment ? { name: compartment.name, unit: formatUnit(compartment.unit, model.timeUnit) } : undefined;
    },
    observableOf: (compartment) => model.observables.find((observable) => "c" in observable.expr && observable.expr.c === compartment)?.id ?? compartment,
    // How big each compartment gets at the start.
    scale: Math.max(...model.parameters.filter((parameter) => parameter.id.endsWith("0")).map((parameter) => Math.abs(parameter.defaultValue)), 1e-12),
    binding: (perWatchSecond) => ({ type: "equations", solver: { id: "compartments.ode", version: "1.0.0" }, model, params: {}, perWatchSecond }),
    routing: { tier: "A", family: "compartments", reason: input.routingReason, primitive: { status: "released" } },
    kit: "town",
    openingSeed: 0,
    primitivesUsed: [{ id: "compartments.ode", version: "1.0.0" }],
    suites: { "worldspec-schema": "worldspec/3", "builder-bindings": "1", "compartment-checks": "1", "level-rule": "1", provenance: "1" },
    made: "A world generated from the paper by PaperPlay's pipeline, checked by its builder and its level rule; the levels, their words and their values are teaching choices, and the model is the paper's as transcribed.",
  };
  return assembleFrom(view, { ...input, plan });
}

/** A generated mechanism's world (ADR-0058): its module named by hash, its manifest's names and ranges, drawn by the mechanism kit. */
export interface MechanismAssembleInput extends Omit<AssembleInput, "model" | "ownNumbers"> {
  readonly module: { readonly sha256: string; readonly characters: number; readonly manifest: MechanismManifest };
}

export function assembleMechanismWorld(input: MechanismAssembleInput): Assembled {
  const { manifest } = input.module;
  const ref = mechanismRef(input.module.sha256);
  const paramOf = (id: string) => manifest.params.find((param) => param.id === id);
  const measurementOf = (id: string) => manifest.measurements.find((measurement) => measurement.id === id);
  const view: ModelView = {
    timeUnit: "step",
    parameter: (id) => {
      const param = paramOf(id);
      // The module's own range, which its checks ran at both ends of: a teaching choice of its writer's.
      return param ? { name: param.label, unit: param.unit || "dimensionless", defaultValue: param.default, origin: "teaching-choice", anchors: [], integer: param.integer ?? false, range: [param.min, param.max] } : undefined;
    },
    quantity: (id) => {
      const measurement = measurementOf(id);
      return measurement ? { name: measurement.label, unit: measurement.unit || "dimensionless" } : undefined;
    },
    observableOf: (id) => id,
    scale: 1,
    binding: (perWatchSecond) => ({ type: "mechanism", primitive: ref, module: { sha256: input.module.sha256, characters: input.module.characters }, manifest, params: {}, perWatchSecond }),
    routing: { tier: "generated", family: "generated", reason: input.routingReason, primitive: { status: "generated" } },
    kit: "mechanism",
    // The level rule's seeds run from 1: the world opens on the first, whose runs the visibility rule drew.
    openingSeed: 1,
    primitivesUsed: [ref],
    suites: { "worldspec-schema": "worldspec/3", "builder-bindings": "1", "mechanism-checks": "1", "level-rule": "1", provenance: "1" },
    made: `A world made from the paper by PaperPlay's pipeline on a ${GENERATED_MODEL_LABEL}: a coding model wrote its mechanism as a module, which the sandbox's checks and the level rule ran; nothing in it reproduces the paper's own experiments.`,
  };
  return assembleFrom(view, input);
}

function assembleFrom(view: ModelView, input: Omit<AssembleInput, "model">): Assembled {
  const { source, explanation, reading, plan } = input;
  // How fast the world plays is a teaching choice: the planner's pace, raised just enough, to a
  // round number, that every level's time shows within the level rule's 20 seconds at 4x.
  const longest = Math.max(...plan.levels.map((level) => level.difference.time));
  const needed = longest / (RULE_WATCH_SECONDS * RULE_FASTEST_SPEED);
  const perWatchSecond = plan.perWatchSecond >= needed ? plan.perWatchSecond : roundUp(needed);
  const notes: string[] = perWatchSecond === plan.perWatchSecond ? [] : [`the world plays at ${perWatchSecond} ${view.timeUnit}(s) a second, not the plan's ${plan.perWatchSecond}, so every level shows within ${RULE_WATCH_SECONDS} s at ${RULE_FASTEST_SPEED}x`];
  /** A finding by its number in the planner's list: 0 the headline result, then the reading's findings. */
  const findingOf = (number: number | null) => (number === null ? null : number === 0 ? reading.result : (reading.findings[number - 1] ?? null));
  const time = TIME_WORDS[view.timeUnit];
  const anchored = (quote: string | null | undefined, what: string): Anchor[] => {
    if (!quote) return [];
    const found = anchorOf(source, quote);
    if (!found) notes.push(`${what}: its quote is not in the source, so it is a teaching choice`);
    return found ? [found] : [];
  };
  const origin = (anchors: readonly Anchor[]) => (anchors.length > 0 ? "paper-derived" : "teaching-choice");
  const unitOf = (id: string): string => view.parameter(id)?.unit ?? view.quantity(id)?.unit ?? "dimensionless";
  const { scale } = view;
  const decimals = scale >= 100 ? 0 : scale >= 1 ? 1 : 3;

  const level = (planned: PlanLevel, words: ExplainedLevel | undefined, index: number) => {
    const id = index === 0 ? "hook" : `level-${index + 1}`;
    const control = view.parameter(planned.control.parameter);
    const value = control?.defaultValue ?? 0;
    const [low, high] = control?.range ?? [0, 1];
    const fine = Number(((high - low) / 150).toPrecision(2));
    const step = control?.integer ? 1 : fine;
    const watched = view.quantity(planned.watch);
    const measured = view.quantity(planned.difference.compartment);
    /** The measured quantity's name after a summary's word, unless the name already says it: "Average temperature", never "Average average temperature". */
    const saying = (already: RegExp, word: string): string => {
      const name = measured?.name ?? planned.difference.compartment;
      return already.test(name) ? `${name.charAt(0).toUpperCase()}${name.slice(1)}` : `${word} ${name.toLowerCase()}`;
    };
    const summaryOf = () => {
      const at = planned.difference.at ?? 0;
      switch (planned.difference.summary) {
        case "at": {
          // A value "at" no stated time is the value at the end of the level's run.
          const when = planned.difference.at ?? planned.difference.time;
          return { summary: { kind: "at", time: when }, label: `${measured?.name ?? planned.difference.compartment} at ${time.one} ${figure(when)}`, unit: unitOf(planned.difference.compartment) };
        }
        case "first-reach":
          return { summary: { kind: "first-reach", threshold: at }, label: `${time.many.charAt(0).toUpperCase()}${time.many.slice(1)} until ${measured?.name.toLowerCase() ?? planned.difference.compartment} first reaches ${figure(at)}`, unit: time.many };
        case "lowest":
          return { summary: { kind: "lowest", from: at }, label: `Lowest ${measured?.name.toLowerCase() ?? planned.difference.compartment} from ${time.one} ${figure(at)}`, unit: unitOf(planned.difference.compartment) };
        case "total":
          return { summary: { kind: "total" }, label: `${measured?.name ?? planned.difference.compartment} summed over ${figure(planned.difference.time)} ${time.many}`, unit: `${unitOf(planned.difference.compartment)} × ${time.many}` };
        case "peak":
          return { summary: { kind: "peak" }, label: `${saying(/^(highest|peak|largest|maximum)\b/i, "Highest")} within ${figure(planned.difference.time)} ${time.many}`, unit: unitOf(planned.difference.compartment) };
        case "mean":
          return { summary: { kind: "mean" }, label: `${saying(/^(average|mean)\b/i, "Average")} over ${figure(planned.difference.time)} ${time.many}`, unit: unitOf(planned.difference.compartment) };
      }
    };
    const { summary, label, unit } = summaryOf();
    // The level's passage: the plan's, else the quote of the finding it tests (ADR-0037).
    const finding = findingOf(planned.finding);
    const passage = anchored(planned.passage?.quote ?? finding?.quote, `level ${index + 1}'s passage`);
    const advancedAnchors = anchored(words?.advanced.quote, `level ${index + 1}'s equation`);
    const afterAnchors = anchored(words?.afterwards.quote, `level ${index + 1}'s closing line`);
    const readings = [...(words?.guide.readings ?? [{ atLeast: 0, words: "now" }])].sort((a, b) => b.atLeast - a.atLeast).filter((reading, at, all) => at === 0 || reading.atLeast < (all[at - 1]?.atLeast ?? Infinity));
    return {
      id,
      order: index + 1,
      kind: index === 0 ? "hook" : planned.kind === "hook" ? "idea" : planned.kind,
      title: planned.title,
      goal: planned.goal,
      bonus: false,
      binding: view.binding(perWatchSecond),
      manipulable: {
        actionId: kebab(planned.control.parameter),
        label: planned.control.label,
        targetVariable: planned.control.parameter,
        range: [low, high],
        unit: unitOf(planned.control.parameter),
        defaultValue: value,
        origin: control?.origin ?? "teaching-choice",
        anchors: [...(control?.anchors ?? [])],
      },
      slider: { step: step > 0 ? step : 0.01, ends: [planned.control.lowEnd, planned.control.highEnd] },
      observable: { metricId: view.observableOf(planned.watch), label: watched?.name ?? planned.watch, shortLabel: watched?.name ?? planned.watch, unit: unitOf(planned.watch), decimals, origin: "computed-observation" },
      counterfactual: {
        prompt: planned.whatIf.prompt,
        altParams: { [planned.whatIf.parameter]: planned.whatIf.value },
        expectedQualitativeEffect: planned.effect,
        origin: "teaching-choice",
        isSpeculative: false,
        anchors: [],
        difference: { metricId: view.observableOf(planned.difference.compartment), label, unit, summary, time: planned.difference.time, claim: { kind: "each", relation: planned.difference.relation, by: planned.difference.by } },
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
        observeMetricId: view.observableOf(planned.watch),
        explainPrompt: words?.afterwards.question ?? "Why?",
        // One origin a sentence (ADR-0042): the world's words are a teaching choice, and the paper's
        // quote, when the source holds it, is its own statement, paper-derived.
        explanation: { text: narrationOf(words?.afterwards.text ?? planned.effect, words?.afterwards.quote ?? null) || planned.effect, origin: "teaching-choice", anchors: [] },
        ...(afterAnchors.length > 0 && afterAnchors[0] ? { paperSays: { text: `“${afterAnchors[0].quote}”`, origin: "paper-derived", anchors: afterAnchors } } : {}),
      },
      furtherReading: [],
      carryForward: planned.carryForward,
    };
  };

  // Level 1 says, as a computed observation, what the check confirmed: that the headline cannot appear here as the paper words it.
  const observation = input.ownNumbers?.observation ?? null;
  const levels = plan.levels.map((planned, index) => ({ ...level(planned, explanation.levels[index], index), ...(index === 0 && observation !== null ? { observation: { text: observation, origin: "computed-observation", anchors: [] } } : {}) }));
  const resultAnchors = anchored(reading.result.quote, "the paper's result");
  const claims = reading.findings.map((finding, index) => {
    const anchors = anchored(finding.quote, `finding ${index + 1}`);
    return { id: `c${index + 1}`, claim: finding.text, dependsOn: [], anchors, origin: origin(anchors) };
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
    routing: view.routing,
    design: { world: view.kit, palette: "cream-teal", density: "comfortable", sections: levels.map((entry) => ({ levelId: entry.id, chartType: "line", motion: "none" })) },
    timeUnit: view.timeUnit,
    openingSeed: view.openingSeed,
    levels,
    primitivesUsed: view.primitivesUsed,
    checks: { suiteIds: Object.keys(view.suites), suiteVersions: view.suites },
    limits: [
      { text: view.made, origin: "teaching-choice", anchors: [] },
      ...plan.limits.map((text) => ({ text, origin: "teaching-choice", anchors: [] })),
      { text: "A draft until the owner reviews it.", origin: "teaching-choice", anchors: [] },
    ],
    ...(input.ownNumbers ? { ownNumbers: { verdict: input.ownNumbers.verdict, statements: input.ownNumbers.statements } } : {}),
  };
  return { spec, notes };
}
