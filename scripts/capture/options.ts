/**
 * The options of `npm run capture:demo -- [--frames]`. With `--frames`, each format is also
 * written as a lossless PNG sequence beside its video, for encoding elsewhere (ADR-0010).
 */
export interface CaptureOptions {
  readonly frames: boolean;
}

export function parseCaptureOptions(argv: readonly string[]): CaptureOptions {
  let frames = false;
  for (const arg of argv) {
    if (arg === "--frames") frames = true;
    else throw new Error(`capture:demo does not know "${arg}"; the only option is --frames`);
  }
  return { frames };
}
