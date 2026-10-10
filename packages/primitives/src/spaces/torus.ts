/** Shortest signed offset on a ring of circumference `size` (E1), in [−size/2, size/2). */
export function shortestOffset(offset: number, size: number): number {
  if (offset >= size / 2) return offset - size;
  if (offset < -size / 2) return offset + size;
  return offset;
}

/** Maps a coordinate onto [0, size) (E10). */
export function wrap(value: number, size: number): number {
  const remainder = value % size;
  const wrapped = remainder < 0 ? remainder + size : remainder;
  return wrapped >= size ? wrapped - size : wrapped;
}
