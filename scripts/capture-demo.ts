/**
 * npm run capture:demo [-- --frames]
 *
 * Films the hook seed forming a murmuration while a beacon is dragged through it
 * (apps/web/src/capture/demo-script.ts), at 1080 × 1350 and at 1920 × 1080, 15 s each,
 * into captures/, which git ignores. The world advances a fixed number of steps per video
 * frame and the beacon follows a script, so the same command makes the same frames every
 * time. Each frame is drawn in software WebGL, as in the browser tests, and encoded by
 * Playwright's own ffmpeg, single-threaded and bit-exact (ADR-0010). With --frames, each
 * format is also written as a lossless PNG sequence, captures/murmuration-WxH/frame-0001.png
 * onwards, for encoding to MP4 elsewhere.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { chromium } from "@playwright/test";
import { flockPlanarWeighted as flock } from "@paperplay/primitives";
import { createServer } from "vite";
import { DEMO } from "../apps/web/src/capture/demo-script.ts";
import { encodeArgs, playwrightFfmpegPath } from "./capture/ffmpeg.ts";
import { parseCaptureOptions } from "./capture/options.ts";

const root = join(import.meta.dirname, "..");
const out = join(root, "captures");
const FORMATS = [
  { width: 1080, height: 1350 },
  { width: 1920, height: 1080 },
] as const;
/** The same software WebGL as playwright.config.ts, so every machine draws the same pixels. */
const SWIFTSHADER = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

function ffmpegPath(): string {
  const coreDir = dirname(createRequire(import.meta.url).resolve("playwright-core/package.json"));
  const { browsers } = JSON.parse(readFileSync(join(coreDir, "browsers.json"), "utf8")) as { browsers: { name: string; revision: string }[] };
  const revision = browsers.find((browser) => browser.name === "ffmpeg")?.revision;
  if (!revision) throw new Error("playwright-core's browsers.json names no ffmpeg revision");
  const path = playwrightFfmpegPath({ platform: process.platform, env: process.env, home: homedir(), revision, coreDir });
  if (!existsSync(path)) throw new Error(`Playwright's ffmpeg is not at ${path}. Install it with: npx playwright install ffmpeg`);
  return path;
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const options = parseCaptureOptions(process.argv.slice(2));
const encoder = ffmpegPath();
mkdirSync(out, { recursive: true });
const server = await createServer({
  root: join(root, "apps/web"),
  configFile: join(root, "apps/web/vite.config.ts"),
  server: { host: "127.0.0.1", port: 4318 },
  logLevel: "error",
});
await server.listen();
const origin = server.resolvedUrls?.local[0];
const browser = await chromium.launch({ args: SWIFTSHADER });
interface PngSequence {
  readonly dir: string;
  readonly pattern: string;
  readonly first: number;
  readonly count: number;
  /** SHA-256 of every PNG's bytes, in frame order. */
  readonly sha256: string;
}
const files: {
  file: string;
  width: number;
  height: number;
  frames: number;
  frameStreamSha256: string;
  videoSha256: string;
  bytes: number;
  pngSequence?: PngSequence;
}[] = [];

try {
  if (!origin) throw new Error("the dev server reported no local address");
  for (const { width, height } of FORMATS) {
    const output = join(out, `murmuration-${width}x${height}.webm`);
    // A fresh directory each run, so no frame from an earlier run can mix in.
    const sequenceDir = join(out, `murmuration-${width}x${height}`);
    rmSync(sequenceDir, { recursive: true, force: true });
    if (options.frames) mkdirSync(sequenceDir);
    const pngs = createHash("sha256");
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("capture.html", origin).href);
    await page.waitForFunction("window.paperplayCapture !== undefined && Number(document.querySelector('.stage')?.dataset.frames ?? 0) > 0");
    if ((await page.locator('.stage[data-webgl="off"]').count()) > 0) throw new Error("the capture browser has no WebGL");

    const ffmpeg = spawn(encoder, encodeArgs({ fps: DEMO.fps, output }), { stdio: ["pipe", "ignore", "pipe"] });
    let log = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => void (log += chunk.toString()));
    ffmpeg.stdin.on("error", (error) => void (log += `\n${error.message}`));
    const closed = once(ffmpeg, "close") as Promise<[number | null]>;
    // If ffmpeg stops early, say why, rather than wait for a pipe that no one reads.
    const feed = async (jpeg: Buffer) => {
      if (ffmpeg.exitCode !== null) throw new Error(`ffmpeg stopped early, with exit code ${ffmpeg.exitCode}: ${log.trim()}`);
      if (!ffmpeg.stdin.write(jpeg)) await Promise.race([once(ffmpeg.stdin, "drain"), closed]);
    };

    const stream = createHash("sha256");
    for (let frame = 1; frame <= DEMO.frames; frame++) {
      await page.evaluate("window.paperplayCapture.next()");
      const jpeg = await page.screenshot({ type: "jpeg", quality: 95 });
      stream.update(jpeg);
      await feed(jpeg);
      if (options.frames) {
        // The stage draws only when asked, so this is the same frame, without JPEG's loss.
        const png = await page.screenshot({ type: "png" });
        pngs.update(png);
        writeFileSync(join(sequenceDir, `frame-${String(frame).padStart(4, "0")}.png`), png);
      }
      if (frame % (3 * DEMO.fps) === 0) console.log(`${width} × ${height}: ${frame / DEMO.fps} s of ${DEMO.frames / DEMO.fps} s`);
    }
    ffmpeg.stdin.end();
    const [code] = await closed;
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}: ${log.trim()}`);
    if (errors.length > 0) throw new Error(`the capture page reported errors: ${errors.join("; ")}`);
    await page.close();

    const video = readFileSync(output);
    files.push({
      file: relative(root, output),
      width,
      height,
      frames: DEMO.frames,
      frameStreamSha256: stream.digest("hex"),
      videoSha256: sha256(video),
      bytes: video.length,
      ...(options.frames
        ? { pngSequence: { dir: relative(root, sequenceDir), pattern: "frame-%04d.png", first: 1, count: DEMO.frames, sha256: pngs.digest("hex") } }
        : {}),
    });
  }

  const manifest = {
    what: "Seed 4 forming a murmuration while a scripted beacon is dragged through it",
    script: "apps/web/src/capture/demo-script.ts",
    primitive: `${flock.id}@${flock.version}`,
    seed: DEMO.seed,
    fps: DEMO.fps,
    stepsPerFrame: DEMO.stepsPerFrame,
    runtime: `node ${process.versions.node}`,
    browser: `chromium ${browser.version()}, SwiftShader`,
    files,
  };
  writeFileSync(join(out, "murmuration.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of files) {
    console.log(`${file.file}: ${file.frames} frames, ${(file.bytes / 1e6).toFixed(1)} MB, frames ${file.frameStreamSha256.slice(0, 12)}, video ${file.videoSha256.slice(0, 12)}`);
    if (file.pngSequence) console.log(`  ${file.pngSequence.dir}/${file.pngSequence.pattern}: ${file.pngSequence.count} lossless frames, ${file.pngSequence.sha256.slice(0, 12)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
