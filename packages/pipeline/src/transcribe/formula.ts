/**
 * A formula as a model writes it, "-beta*S*I/N", parsed into the compartment family's closed
 * expression tree (ADR-0028). The grammar is the tree's own and no more: numbers, names, + − × ÷,
 * powers, brackets, unary minus, exp and log. Every name must be a compartment or a parameter the
 * caller names; anything else is refused with where it went wrong. Nothing is evaluated.
 */
import type { Expr } from "@paperplay/contracts";

export class FormulaError extends Error {
  readonly at: number;
  constructor(message: string, at: number) {
    super(message);
    this.name = "FormulaError";
    this.at = at;
  }
}

type Token = { readonly kind: "number"; readonly value: number; readonly at: number } | { readonly kind: "name"; readonly value: string; readonly at: number } | { readonly kind: "op"; readonly value: string; readonly at: number };

const OPERATORS = new Set(["+", "-", "*", "/", "^", "(", ")", ","]);
const FUNCTIONS = new Set(["exp", "log", "ln"]);

export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  const source = formula.replaceAll("−", "-").replaceAll("×", "*").replaceAll("·", "*").replaceAll("÷", "/").replaceAll("**", "^");
  for (let i = 0; i < source.length; ) {
    const char = source[i] ?? "";
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]), at: i });
      i += number[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
    if (name) {
      tokens.push({ kind: "name", value: name[0], at: i });
      i += name[0].length;
      continue;
    }
    if (OPERATORS.has(char)) {
      tokens.push({ kind: "op", value: char, at: i });
      i++;
      continue;
    }
    throw new FormulaError(`"${char}" is not part of a formula: use numbers, names, + - * / ^, brackets, exp and log`, i);
  }
  return tokens;
}

/** Parses a formula against the names it may use: compartments and parameters. */
export function parseFormula(formula: string, names: { readonly compartments: ReadonlySet<string>; readonly parameters: ReadonlySet<string> }): Expr {
  const tokens = tokenize(formula);
  let position = 0;
  const peek = (): Token | undefined => tokens[position];
  const at = (): number => peek()?.at ?? formula.length;
  const isOp = (value: string): boolean => peek()?.kind === "op" && peek()?.value === value;
  const expect = (value: string): void => {
    if (!isOp(value)) throw new FormulaError(`expected "${value}"`, at());
    position++;
  };
  const flatten = (op: "add" | "mul", a: Expr, b: Expr): Expr => {
    const parts = (expr: Expr): Expr[] => ("args" in expr && expr.op === op ? [...expr.args] : [expr]);
    return { op, args: [...parts(a), ...parts(b)] };
  };

  // expression := term (("+" | "-") term)*
  const expression = (): Expr => {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = peek()?.value;
      position++;
      const right = term();
      left = op === "+" ? flatten("add", left, right) : { op: "sub", a: left, b: right };
    }
    return left;
  };
  // term := unary (("*" | "/") unary | implicit unary)*
  const term = (): Expr => {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = peek()?.value;
        position++;
        const right = unary();
        left = op === "*" ? flatten("mul", left, right) : { op: "div", a: left, b: right };
      } else if (peek()?.kind === "name" || peek()?.kind === "number" || isOp("(")) {
        // Juxtaposition, as in "beta S I", is multiplication.
        left = flatten("mul", left, unary());
      } else return left;
    }
  };
  // unary := "-" unary | power
  const unary = (): Expr => {
    if (isOp("-")) {
      position++;
      return { op: "neg", a: unary() };
    }
    if (isOp("+")) {
      position++;
      return unary();
    }
    return power();
  };
  // power := atom ("^" unary)?   (right-associative)
  const power = (): Expr => {
    const base = atom();
    if (isOp("^")) {
      position++;
      return { op: "pow", a: base, b: unary() };
    }
    return base;
  };
  const atom = (): Expr => {
    const token = peek();
    if (!token) throw new FormulaError("the formula ends too soon", formula.length);
    if (token.kind === "number") {
      position++;
      return { n: token.value };
    }
    if (token.kind === "name") {
      position++;
      if (FUNCTIONS.has(token.value) && isOp("(")) {
        position++;
        const argument = expression();
        expect(")");
        return { op: token.value === "exp" ? "exp" : "log", a: argument };
      }
      if (names.compartments.has(token.value)) return { c: token.value };
      if (names.parameters.has(token.value)) return { p: token.value };
      throw new FormulaError(`"${token.value}" is neither a compartment nor a parameter of this model`, token.at);
    }
    if (token.value === "(") {
      position++;
      const inner = expression();
      expect(")");
      return inner;
    }
    throw new FormulaError(`unexpected "${token.value}"`, token.at);
  };

  const result = expression();
  if (position < tokens.length) throw new FormulaError(`unexpected "${String(peek()?.value)}" after a complete formula`, at());
  return result;
}

/** How tightly each kind of expression binds, for printing only the brackets a formula needs. */
const precedence = (expr: Expr): number => {
  if (!("op" in expr)) return 5;
  if (expr.op === "add" || expr.op === "sub") return 1;
  if (expr.op === "mul" || expr.op === "div") return 2;
  if (expr.op === "neg") return 3;
  return 4;
};

/** An expression as a formula, the parser's inverse up to brackets: for showing a transcription. */
export function formulaOf(expr: Expr): string {
  if ("n" in expr) return String(expr.n);
  if ("p" in expr) return expr.p;
  if ("c" in expr) return expr.c;
  const at = (child: Expr, least: number): string => (precedence(child) < least ? `(${formulaOf(child)})` : formulaOf(child));
  switch (expr.op) {
    case "add":
      return expr.args.map((arg) => at(arg, 1)).join(" + ");
    case "mul":
      return expr.args.map((arg) => at(arg, 2)).join("*");
    case "sub":
      return `${at(expr.a, 1)} - ${at(expr.b, 2)}`;
    case "div":
      return `${at(expr.a, 2)}/${at(expr.b, 3)}`;
    case "pow":
      return `${at(expr.a, 5)}^${at(expr.b, 5)}`;
    case "neg":
      return `-${at(expr.a, 3)}`;
    case "exp":
    case "log":
      return `${expr.op}(${formulaOf(expr.a)})`;
  }
}
