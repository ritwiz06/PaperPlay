export type Vec3 = readonly [number, number, number];
/** A 4 × 4 matrix as 16 numbers in column-major order (the layout Three.js and WebGL use). */
export type Mat4 = readonly number[];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / Math.sqrt(dot(a, a)));

const at = (m: Mat4, column: number, row: number): number => m[column * 4 + row] ?? Number.NaN;

/** m · [x, y, z, w]. */
export function transform4(m: Mat4, [x, y, z, w]: readonly [number, number, number, number]): [number, number, number, number] {
  const row = (r: number) => at(m, 0, r) * x + at(m, 1, r) * y + at(m, 2, r) * z + at(m, 3, r) * w;
  return [row(0), row(1), row(2), row(3)];
}

/** m · [p, 1], without the perspective divide. */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = transform4(m, [p[0], p[1], p[2], 1]);
  return [x, y, z];
}
