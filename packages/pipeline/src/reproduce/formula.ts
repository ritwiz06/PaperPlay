/**
 * A paper's own formula, read from its LaTeX (ADR-0040): the reproduction number as the paper
 * writes it, `\frac{b β_{1}}{μ m_{1}} + …`, with the symbols it defines nearby ("where
 * $m_{1} = μ + r$"), read into an expression over the model's parameters. Deterministic and
 * small: numbers, symbols with subscripts, sums, products written side by side, fractions, powers,
 * brackets. Anything else is refused by name, never guessed at.
 */
import type { Expr } from "@paperplay/contracts";

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

/** Greek letters as LaTeX names them, to the characters a JATS text holds. */
const GREEK: Readonly<Record<string, string>> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "π", rho: "ρ", varrho: "ρ", sigma: "σ", varsigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", varLambda: "Λ", Xi: "Ξ", Pi: "Π", varPi: "Π", Sigma: "Σ", varSigma: "Σ",
  Upsilon: "Υ", varUpsilon: "Υ", Phi: "Φ", varPhi: "Φ", Psi: "Ψ", varPsi: "Ψ", Omega: "Ω", varOmega: "Ω", varGamma: "Γ", varDelta: "Δ", varTheta: "Θ",
};
/** Variant letters a paper may use for one symbol: folded together so ϕ and φ name the same thing. */
const VARIANTS: Readonly<Record<string, string>> = { "ϕ": "φ", "ϵ": "ε", "ϑ": "θ", "ϱ": "ρ", "ϖ": "π", "ς": "σ", "−": "-" };
/** Commands that only size, space or style what follows. */
const IGNORED = new Set(["left", "right", "displaystyle", "textstyle", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "Biggl", "Biggr", "quad", "qquad", "nonumber", "notag", "label"]);
/** Commands whose one argument is the symbol itself, styled. */
const STYLES = new Set(["mathcal", "mathscr", "mathrm", "mathit", "mathbf", "boldsymbol", "bm", "operatorname", "text", "mathsf"]);

/**
 * A symbol's name with its styling and spacing gone, its variants folded and its subscript joined:
 * "β_{1}" and "\beta_1" are "β1", "C_{q}" is "Cq", "\mathscr{R}_0" is "R0", "ℛ_{0}" is "R0".
 */
export function symbolName(raw: string): string {
  let text = raw.normalize("NFKC").replace(/\$/g, "");
  text = text.replace(/\\([A-Za-z]+)/g, (whole, name: string) => (GREEK[name] ?? (STYLES.has(name) || IGNORED.has(name) ? "" : whole)));
  for (const [variant, letter] of Object.entries(VARIANTS)) text = text.replaceAll(variant, letter);
  return text.replace(/ℛ/g, "R").replace(/[\s{}_]/g, "");
}

type Token = { readonly kind: "number"; readonly value: number } | { readonly kind: "symbol"; readonly name: string } | { readonly kind: "op"; readonly value: string } | { readonly kind: "command"; readonly name: string };

function tokenize(latex: string): Token[] {
  const text = latex.normalize("NFKC");
  const tokens: Token[] = [];
  let at = 0;
  /** A braced group, or a single character or command, as written: for subscripts and styled names. */
  const groupText = (): string => {
    while (/\s/.test(text[at] ?? "")) at++;
    if (text[at] === "{") {
      let depth = 0;
      const start = at;
      for (; at < text.length; at++) {
        if (text[at] === "{") depth++;
        else if (text[at] === "}" && --depth === 0) {
          at++;
          return text.slice(start + 1, at - 1);
        }
      }
      throw new FormulaError("a brace is never closed");
    }
    const command = /^\\[A-Za-z]+/.exec(text.slice(at));
    if (command) {
      at += command[0].length;
      return command[0];
    }
    return text[at++] ?? "";
  };
  /** A symbol's letter, then its subscript, joined: "β", "β_{1}", "C_q". */
  const symbol = (letter: string): Token => {
    let name = letter;
    if (text[at] === "_") {
      at++;
      name += symbolName(groupText());
    }
    return { kind: "symbol", name: symbolName(name) };
  };
  while (at < text.length) {
    const char = text[at] ?? "";
    if (/\s|&|~/.test(char)) {
      at++;
      continue;
    }
    const number = /^\d+(?:\.\d+)?|^\.\d+/.exec(text.slice(at));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      at += number[0].length;
      continue;
    }
    if (char === "\\") {
      const name = /^\\([A-Za-z]+|[,;:! ])/.exec(text.slice(at))?.[1] ?? "";
      at += name.length + 1;
      if (name === "" || /^[,;:! ]$/.test(name) || IGNORED.has(name)) continue;
      if (GREEK[name]) tokens.push(symbol(GREEK[name]));
      else if (STYLES.has(name)) tokens.push(symbol(symbolName(groupText())));
      else if (name === "cdot" || name === "times") tokens.push({ kind: "op", value: "*" });
      else if (name === "{" || name === "}") tokens.push({ kind: "op", value: name === "{" ? "(" : ")" });
      else tokens.push({ kind: "command", name });
      continue;
    }
    if (/[A-Za-zΑ-ωϕϵϑϱϖς]/.test(char)) {
      at++;
      tokens.push(symbol(char));
      continue;
    }
    if ("+-−*/^()[]{}".includes(char)) {
      at++;
      tokens.push({ kind: "op", value: char === "−" ? "-" : char === "[" ? "(" : char === "]" ? ")" : char });
      continue;
    }
    if (char === "," || char === "." || char === ";") {
      at++;
      continue;
    }
    throw new FormulaError(`it holds "${char}", which the reader does not read`);
  }
  return tokens;
}

/** Reads a formula into an expression, each symbol resolved by `resolve`, which names what it cannot. */
export function parseFormula(latex: string, resolve: (name: string) => Expr): Expr {
  const tokens = tokenize(latex);
  let at = 0;
  const peek = (): Token | undefined => tokens[at];
  const isOp = (value: string): boolean => {
    const token = peek();
    return token?.kind === "op" && token.value === value;
  };
  const expect = (value: string): void => {
    if (!isOp(value)) throw new FormulaError(`it expects "${value}" where it has ${describe(peek())}`);
    at++;
  };
  const describe = (token: Token | undefined): string => (token === undefined ? "nothing" : token.kind === "number" ? String(token.value) : token.kind === "symbol" ? token.name : token.kind === "op" ? `"${token.value}"` : `\\${token.name}`);
  const group = (): Expr => {
    if (isOp("{")) {
      at++;
      const inner = sum();
      expect("}");
      return inner;
    }
    return primary();
  };
  const startsFactor = (token: Token | undefined): boolean => token !== undefined && (token.kind === "number" || token.kind === "symbol" || token.kind === "command" || (token.kind === "op" && (token.value === "(" || token.value === "{")));
  function primary(): Expr {
    const token = peek();
    if (token === undefined) throw new FormulaError("it ends where a term should be");
    if (token.kind === "number") {
      at++;
      return { n: token.value };
    }
    if (token.kind === "symbol") {
      at++;
      return resolve(token.name);
    }
    if (token.kind === "op" && (token.value === "(" || token.value === "{")) {
      at++;
      const inner = sum();
      expect(token.value === "(" ? ")" : "}");
      return inner;
    }
    if (token.kind === "command") {
      at++;
      if (token.name === "frac" || token.name === "dfrac" || token.name === "tfrac") return { op: "div", a: group(), b: group() };
      if (token.name === "sqrt") return { op: "pow", a: group(), b: { n: 0.5 } };
      if (token.name === "exp") return { op: "exp", a: power() };
      if (token.name === "ln" || token.name === "log") return { op: "log", a: power() };
      throw new FormulaError(`it uses \\${token.name}, which the reader does not read`);
    }
    throw new FormulaError(`it has ${describe(token)} where a term should be`);
  }
  function power(): Expr {
    const base = primary();
    if (!isOp("^")) return base;
    at++;
    return { op: "pow", a: base, b: group() };
  }
  function unary(): Expr {
    if (isOp("-")) {
      at++;
      return { op: "neg", a: unary() };
    }
    if (isOp("+")) {
      at++;
      return unary();
    }
    return power();
  }
  function product(): Expr {
    let value = unary();
    for (;;) {
      if (isOp("*")) {
        at++;
        value = { op: "mul", args: [value, unary()] };
      } else if (isOp("/")) {
        at++;
        value = { op: "div", a: value, b: unary() };
      } else if (startsFactor(peek())) value = { op: "mul", args: [value, power()] };
      else return value;
    }
  }
  function sum(): Expr {
    let value = product();
    for (;;) {
      if (isOp("+")) {
        at++;
        value = { op: "add", args: [value, product()] };
      } else if (isOp("-")) {
        at++;
        value = { op: "sub", a: value, b: product() };
      } else return value;
    }
  }
  const result = sum();
  if (at < tokens.length) throw new FormulaError(`it has ${describe(peek())} after the formula ends`);
  return result;
}

/** An expression's value, parameters read from `values`; NaN where it cannot be computed. */
export function evaluate(expr: Expr, values: Readonly<Record<string, number>>): number {
  if ("n" in expr) return expr.n;
  if ("p" in expr) return values[expr.p] ?? Number.NaN;
  if ("c" in expr) return values[expr.c] ?? Number.NaN;
  switch (expr.op) {
    case "add":
      return expr.args.reduce((total, arg) => total + evaluate(arg, values), 0);
    case "mul":
      return expr.args.reduce((total, arg) => total * evaluate(arg, values), 1);
    case "sub":
      return evaluate(expr.a, values) - evaluate(expr.b, values);
    case "div":
      return evaluate(expr.a, values) / evaluate(expr.b, values);
    case "pow":
      return evaluate(expr.a, values) ** evaluate(expr.b, values);
    case "neg":
      return -evaluate(expr.a, values);
    case "exp":
      return Math.exp(evaluate(expr.a, values));
    case "log":
      return Math.log(evaluate(expr.a, values));
  }
}

/** The parameters an expression names. */
export function parametersOf(expr: Expr): Set<string> {
  if ("n" in expr) return new Set();
  if ("p" in expr) return new Set([expr.p]);
  if ("c" in expr) return new Set();
  const parts = "args" in expr ? expr.args : "b" in expr ? [expr.a, expr.b] : [expr.a];
  return new Set(parts.flatMap((part) => [...parametersOf(part)]));
}
