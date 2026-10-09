/**
 * The encoder behind `npm run capture:demo`: the ffmpeg build Playwright installs for its
 * own videos, so the capture needs no dependency of its own. That build reads JPEG frames
 * and writes VP8 WebM, and nothing else.
 */
import { posix, win32 } from "node:path";

export interface FfmpegLookup {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  /** Playwright's ffmpeg revision, from playwright-core's browsers.json. */
  readonly revision: string;
  /** Where playwright-core is installed, for PLAYWRIGHT_BROWSERS_PATH=0. */
  readonly coreDir: string;
}

const EXECUTABLES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "ffmpeg-mac",
  linux: "ffmpeg-linux",
  win32: "ffmpeg-win64.exe",
};

/** Where Playwright keeps its ffmpeg, following Playwright's own rules for its browser cache. */
export function playwrightFfmpegPath({ platform, env, home, revision, coreDir }: FfmpegLookup): string {
  const executable = EXECUTABLES[platform];
  if (!executable) throw new Error(`Playwright ships no ffmpeg for ${platform}`);
  const path = platform === "win32" ? win32 : posix;
  const override = env["PLAYWRIGHT_BROWSERS_PATH"];
  const cache =
    override === "0"
      ? path.join(coreDir, ".local-browsers")
      : override
        ? override
        : platform === "darwin"
          ? path.join(home, "Library", "Caches", "ms-playwright")
          : platform === "win32"
            ? path.join(env["LOCALAPPDATA"] ?? path.join(home, "AppData", "Local"), "ms-playwright")
            : path.join(env["XDG_CACHE_HOME"] ?? path.join(home, ".cache"), "ms-playwright");
  return path.join(cache, `ffmpeg-${revision}`, executable);
}

/**
 * JPEG frames on stdin, at a fixed frame rate, to VP8 WebM. Single-threaded and bit-exact,
 * with no metadata, so the same frames always make the same file. Stdin is `pipe:0`, as
 * Playwright names it: this build has no `-` protocol.
 */
export function encodeArgs({ fps, output }: { readonly fps: number; readonly output: string }): string[] {
  return [
    ["-hide_banner", "-loglevel", "error", "-y"],
    ["-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "pipe:0"],
    ["-c:v", "libvpx", "-b:v", "12M", "-crf", "4", "-qmin", "0", "-qmax", "24", "-deadline", "good", "-cpu-used", "1"],
    ["-auto-alt-ref", "0", "-threads", "1", "-pix_fmt", "yuv420p"],
    ["-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1"],
    [output],
  ].flat();
}
