import type { Compiled } from "./expr.ts";

/** The compiled right-hand side f(x) of MODEL.md E2: each compartment's rate, in compartment order. */
export type Rates = readonly Compiled[];

/** f(x), component by component in compartment order. */
function evaluate(rates: Rates, x: Float64Array, params: Float64Array): Float64Array {
  const out = new Float64Array(rates.length);
  rates.forEach((rate, j) => (out[j] = rate(x, params)));
  return out;
}

/**
 * One classical Runge–Kutta step of size dt, exactly as MODEL.md E3 writes it: the four
 * stages in order, every component in compartment order, and the weighted sum grouped
 * ((k1 + 2·k2) + 2·k3) + k4, so the arithmetic, and so every bit, is fixed. Returns a new
 * vector and never writes to x.
 */
export function rk4Step(rates: Rates, x: Float64Array, params: Float64Array, dt: number): Float64Array {
  const size = rates.length;
  const h = dt / 2;
  const y = new Float64Array(size);

  const k1 = evaluate(rates, x, params);
  for (let j = 0; j < size; j++) y[j] = (x[j] as number) + h * (k1[j] as number);
  const k2 = evaluate(rates, y, params);
  for (let j = 0; j < size; j++) y[j] = (x[j] as number) + h * (k2[j] as number);
  const k3 = evaluate(rates, y, params);
  for (let j = 0; j < size; j++) y[j] = (x[j] as number) + dt * (k3[j] as number);
  const k4 = evaluate(rates, y, params);

  const sixth = dt / 6;
  const next = new Float64Array(size);
  for (let j = 0; j < size; j++) next[j] = (x[j] as number) + sixth * ((k1[j] as number) + 2 * (k2[j] as number) + 2 * (k3[j] as number) + (k4[j] as number));
  return next;
}
