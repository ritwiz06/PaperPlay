import type { Expr } from "@paperplay/contracts";

/** A compiled expression: reads compartments and parameters by index, and nothing else. */
export type Compiled = (compartments: Float64Array, params: Float64Array) => number;

/** Where each compartment and parameter sits in the vectors a compiled expression reads. */
export interface Indices {
  readonly compartments: ReadonlyMap<string, number>;
  readonly parameters: ReadonlyMap<string, number>;
}

function indexOf(map: ReadonlyMap<string, number>, id: string, kind: string): number {
  const index = map.get(id);
  if (index === undefined) throw new RangeError(`the expression names ${kind} ${id}, which the model does not have`);
  return index;
}

/**
 * Compiles an expression into a closure, by MODEL.md E1: nothing is evaluated from text and no
 * Function constructor is called, only closures over the tree's nodes, so the same inputs give
 * the same bits. Sums and products run
 * over their arguments left to right.
 */
export function compileExpr(expr: Expr, indices: Indices): Compiled {
  if ("n" in expr) {
    const value = expr.n;
    return () => value;
  }
  if ("p" in expr) {
    const at = indexOf(indices.parameters, expr.p, "parameter");
    return (_compartments, params) => params[at] as number;
  }
  if ("c" in expr) {
    const at = indexOf(indices.compartments, expr.c, "compartment");
    return (compartments) => compartments[at] as number;
  }
  switch (expr.op) {
    case "add": {
      const [first, ...rest] = expr.args.map((arg) => compileExpr(arg, indices)) as [Compiled, ...Compiled[]];
      return (x, params) => {
        let sum = first(x, params);
        for (const term of rest) sum += term(x, params);
        return sum;
      };
    }
    case "mul": {
      const [first, ...rest] = expr.args.map((arg) => compileExpr(arg, indices)) as [Compiled, ...Compiled[]];
      return (x, params) => {
        let product = first(x, params);
        for (const factor of rest) product *= factor(x, params);
        return product;
      };
    }
    case "sub": {
      const [a, b] = [compileExpr(expr.a, indices), compileExpr(expr.b, indices)];
      return (x, params) => a(x, params) - b(x, params);
    }
    case "div": {
      const [a, b] = [compileExpr(expr.a, indices), compileExpr(expr.b, indices)];
      return (x, params) => a(x, params) / b(x, params);
    }
    case "pow": {
      const [a, b] = [compileExpr(expr.a, indices), compileExpr(expr.b, indices)];
      return (x, params) => Math.pow(a(x, params), b(x, params));
    }
    case "neg": {
      const a = compileExpr(expr.a, indices);
      return (x, params) => -a(x, params);
    }
    case "exp": {
      const a = compileExpr(expr.a, indices);
      return (x, params) => Math.exp(a(x, params));
    }
    case "log": {
      const a = compileExpr(expr.a, indices);
      return (x, params) => Math.log(a(x, params));
    }
  }
}

/**
 * Compiles M of MODEL.md C4: the expression's size if none of its sums cancelled. Sums add
 * their operands' sizes, products multiply them, and exp, log and pow are taken at their
 * |value|, so |value| ≤ M in exact arithmetic. The steady-state check measures a net rate
 * against it.
 */
export function compileMagnitude(expr: Expr, indices: Indices): Compiled {
  if ("n" in expr || "p" in expr || "c" in expr) {
    const value = compileExpr(expr, indices);
    return (x, params) => Math.abs(value(x, params));
  }
  switch (expr.op) {
    case "add":
    case "mul": {
      const [first, ...rest] = expr.args.map((arg) => compileMagnitude(arg, indices)) as [Compiled, ...Compiled[]];
      const multiply = expr.op === "mul";
      return (x, params) => {
        let total = first(x, params);
        for (const part of rest) total = multiply ? total * part(x, params) : total + part(x, params);
        return total;
      };
    }
    case "sub": {
      const [a, b] = [compileMagnitude(expr.a, indices), compileMagnitude(expr.b, indices)];
      return (x, params) => a(x, params) + b(x, params);
    }
    case "div": {
      const [a, b] = [compileMagnitude(expr.a, indices), compileExpr(expr.b, indices)];
      return (x, params) => a(x, params) / Math.abs(b(x, params));
    }
    case "neg":
      return compileMagnitude(expr.a, indices);
    case "pow":
    case "exp":
    case "log": {
      const value = compileExpr(expr, indices);
      return (x, params) => Math.abs(value(x, params));
    }
  }
}

/** How tightly each node binds when written out: a child that binds more loosely than its parent's operator is bracketed. */
function bindingOf(expr: Expr): number {
  if ("n" in expr) return expr.n < 0 ? 3 : 5;
  if ("p" in expr || "c" in expr) return 5;
  switch (expr.op) {
    case "add":
    case "sub":
      return 1;
    case "mul":
    case "div":
      return 2;
    case "neg":
      return 3;
    case "pow":
      return 4;
    case "exp":
    case "log":
      return 5;
  }
}

/** Writes an expression out in ordinary notation, by ids, for messages: "s + i + r", "beta × s × i − gamma × i". */
export function formatExpr(expr: Expr): string {
  const inner = (child: Expr, tightest: number): string => {
    const text = formatExpr(child);
    return bindingOf(child) < tightest ? `(${text})` : text;
  };
  if ("n" in expr) return expr.n < 0 ? `−${String(-expr.n)}` : String(expr.n);
  if ("p" in expr) return expr.p;
  if ("c" in expr) return expr.c;
  switch (expr.op) {
    case "add":
      return expr.args.map((arg) => inner(arg, 1)).join(" + ");
    case "mul":
      return expr.args.map((arg) => inner(arg, 2)).join(" × ");
    case "sub":
      return `${inner(expr.a, 1)} − ${inner(expr.b, 2)}`;
    case "div":
      return `${inner(expr.a, 2)} / ${inner(expr.b, 3)}`;
    case "pow":
      return `${inner(expr.a, 5)}^${inner(expr.b, 5)}`;
    case "neg":
      return `−${inner(expr.a, 4)}`;
    case "exp":
    case "log":
      return `${expr.op}(${formatExpr(expr.a)})`;
  }
}
