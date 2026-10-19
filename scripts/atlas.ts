/**
 * npm run atlas [-- --jobs <folder> ...] [-- --only <world-id>] [-- --workers <n>] [-- --date <name>] [-- --redo clips|storyboards]
 *
 * The owner's UI atlas (ADR-0050). Serves the app on a development server of its own and visits,
 * at 1440 × 900 and 390 × 844, every page that is not a world, every world the library lists and
 * every level of each, in every state a learner reaches: opened, after moving the control, with
 * What if's prediction asked, with the fork running and finished, with the journal open, and with
 * the depth switched; and, for each generated world, the storyboard of the job that made it, its
 * own events played back to /create. Shots open still, with reduced motion, so that they compare
 * from one atlas to the next, drawn in software as the tests draw them; each level also gets a
 * 6-second clip, played and filmed with the machine's GPU, one world at a time. Everything goes into
 * captures/atlas/<date>/, which git ignores, with one gallery page, index.html, grouped by world
 * and then by level, every shot captioned with its route, its level's title, its control, its
 * readout and any known issue, and marked where it changed since the previous atlas.
 *
 * A job's events come from the API's data folders, apps/api/data/jobs by default or each --jobs
 * given, which only the machine that ran the jobs has; a world whose job is not there plays back
 * its job record's states. With --redo clips or --redo storyboards, that part of an atlas already
 * taken is taken again.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "@playwright/test";
import { playwrightFfmpegPath } from "./capture/ffmpeg.ts";
import { KNOWN_ISSUES } from "./atlas/known-issues.ts";
import { galleryContent, galleryPage, LEVEL_STATES, SIZES, type Atlas, type AtlasWorld, type Change, type Clip, type EarlierSet, type LevelState, type Shot, type Size } from "./atlas/gallery.ts";

const root = join(import.meta.dirname, "..");
const PORT = 4419;
const origin = `http://127.0.0.1:${PORT}`;
const SWIFTSHADER = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const CLIP_SECONDS = 6;
/** How long a fork may take to finish at 4× before the atlas says it did not. */
const FORK_LIMIT_MS = 150_000;

const argument = (name: string): string | null => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
};
/** Where jobs' events are: each --jobs folder given, or this checkout's API data folder. */
const JOBS = process.argv.flatMap((value, at) => (process.argv[at - 1] === "--jobs" ? [value] : []));
if (JOBS.length === 0) JOBS.push(join(root, "apps", "api", "data", "jobs"));
const ONLY = argument("--only");
/** How many worlds are shot at once. */
const WORKERS = Number(argument("--workers") ?? 3);

interface LibraryEntry {
  readonly id: string;
  readonly route: string;
  readonly title: string;
  readonly madeBy: "hand" | "pipeline";
  readonly status: "verified" | "draft" | "generated";
  readonly family: string;
  readonly paper: { readonly title: string };
  readonly levels: readonly { readonly order: number; readonly title: string; readonly bonus: boolean }[];
  readonly definitional: readonly number[];
}
// A retired world has no route, so the atlas has nothing of it to visit.
const library = (JSON.parse(readFileSync(join(root, "apps", "web", "src", "library", "worlds.json"), "utf8")) as { worlds: (LibraryEntry & { readonly route: string | null })[] }).worlds.filter((world): world is LibraryEntry => world.route !== null && (!ONLY || world.id === ONLY));

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const DATE = argument("--date") ?? today();
const ATLASES = join(root, "captures", "atlas");
const out = join(ATLASES, DATE);
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const commit = await new Promise<string>((resolve) => {
  const git = spawn("git", ["rev-parse", "HEAD"], { cwd: root });
  let text = "";
  git.stdout.on("data", (chunk: Buffer) => void (text += chunk.toString()));
  git.on("close", () => resolve(text.trim()));
});

/** The atlas before this one: the newest folder of another date with a manifest. */
function previousAtlas(): { name: string; atlas: Atlas } | null {
  if (!existsSync(ATLASES)) return null;
  const names = readdirSync(ATLASES)
    .filter((name) => name !== DATE && existsSync(join(ATLASES, name, "manifest.json")))
    .sort();
  const name = names.at(-1);
  return name ? { name, atlas: JSON.parse(readFileSync(join(ATLASES, name, "manifest.json"), "utf8")) as Atlas } : null;
}

function ffmpegPath(): string {
  const coreDir = dirname(createRequire(import.meta.url).resolve("playwright-core/package.json"));
  const { browsers } = JSON.parse(readFileSync(join(coreDir, "browsers.json"), "utf8")) as { browsers: { name: string; revision: string }[] };
  const revision = browsers.find((browser) => browser.name === "ffmpeg")?.revision;
  if (!revision) throw new Error("playwright-core's browsers.json names no ffmpeg revision");
  const path = playwrightFfmpegPath({ platform: process.platform, env: process.env, home: homedir(), revision, coreDir });
  if (!existsSync(path)) throw new Error(`Playwright's ffmpeg is not at ${path}. Install it with: npx playwright install ffmpeg`);
  return path;
}

/** JPEG frames to a small VP8 WebM at the rate they were taken: a clip to watch, not a capture to compare. */
async function encode(frames: readonly Buffer[], fps: number, output: string): Promise<void> {
  const args = [
    ["-hide_banner", "-loglevel", "error", "-y"],
    ["-f", "image2pipe", "-c:v", "mjpeg", "-framerate", fps.toFixed(3), "-i", "pipe:0"],
    ["-c:v", "libvpx", "-b:v", "1200k", "-crf", "24", "-qmin", "4", "-qmax", "42", "-deadline", "good", "-cpu-used", "4", "-auto-alt-ref", "0", "-pix_fmt", "yuv420p"],
    [output],
  ].flat();
  const ffmpeg = spawn(ffmpegPath(), args, { stdio: ["pipe", "ignore", "pipe"] });
  let log = "";
  ffmpeg.stderr.on("data", (chunk: Buffer) => void (log += chunk.toString()));
  const closed = once(ffmpeg, "close") as Promise<[number | null]>;
  for (const frame of frames) if (!ffmpeg.stdin.write(frame)) await Promise.race([once(ffmpeg.stdin, "drain"), closed]);
  ffmpeg.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}: ${log.trim()}`);
}

async function waitFor(url: string, seconds: number): Promise<void> {
  for (let tries = 0; tries < seconds * 4; tries++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} did not answer within ${seconds} s`);
}

/** Problems a page shows by itself: its console's errors since the last shot, and a page wider than its window. */
function watch(page: Page): () => Promise<string[]> {
  let errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return async () => {
    const found = errors.map((error) => `Console error: ${error.slice(0, 200)}`);
    errors = [];
    const wide = Number(await page.evaluate("document.documentElement.scrollWidth - window.innerWidth").catch(() => 0));
    if (wide > 1) found.push(`The page is ${wide} px wider than its window, so it scrolls sideways.`);
    return found;
  };
}

async function axeIssues(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map((violation) => `Axe: ${violation.id}, ${violation.help} (${violation.nodes.length} ${violation.nodes.length === 1 ? "element" : "elements"})`);
}

const oneLine = (text: string | null | undefined): string | null => (text ? text.replace(/\s+/g, " ").replace(/\s+([;:.,])/g, "$1").replace(/[;\s]+$/, "").trim() || null : null);

async function stageReady(page: Page): Promise<void> {
  await page.getByRole("application", { name: "World stage" }).waitFor({ timeout: 60_000 });
  await page.waitForFunction("Number(document.querySelector('[data-frames]')?.getAttribute('data-frames') ?? 0) > 0", undefined, { timeout: 60_000 });
}

/** The world's levels, by id, in the level map's order. */
async function levelIds(page: Page): Promise<string[]> {
  return Promise.all((await page.locator(".level-map li[data-level]").all()).map(async (item) => (await item.getAttribute("data-level")) ?? ""));
}

/** The level card's control as it stands: its label and its value, as a screen reader hears them. */
async function controlOf(page: Page): Promise<string | null> {
  const slider = page.locator(".level-card input[type=range]").first();
  if ((await slider.count()) === 0) return null;
  const [label, value] = await Promise.all([slider.getAttribute("aria-label"), slider.getAttribute("aria-valuetext")]);
  return `${label ?? "the control"}: ${value ?? (await slider.inputValue())}`;
}

/** The text of what a selector finds, without its origin chips, which the caption does not need. */
async function textOf(page: Page, selector: string): Promise<string | null> {
  const text = await page.evaluate(
    // A description list reads "Susceptible: most; Infectious: hardly any"; other elements end with a space.
    `[...document.querySelectorAll(${JSON.stringify(selector)})].map((element) => { const copy = element.cloneNode(true); copy.querySelectorAll(".origin-tag").forEach((tag) => tag.remove()); copy.querySelectorAll("*").forEach((part) => part.append(part.tagName === "DT" ? ": " : part.tagName === "DD" ? "; " : " ")); return copy.textContent; }).join(" ")`,
  );
  return oneLine(String(text));
}

/** The level's readout, or once a fork is open, its measured result, whether the statement held, or how far it has run. */
async function readoutOf(page: Page): Promise<string | null> {
  if ((await page.locator("main[data-fork=open]").count()) > 0) return textOf(page, ".fork [data-measured], .fork [data-measured] ~ p");
  return textOf(page, ".level-card .level-readout");
}

interface Taken {
  readonly bytes: Buffer;
  readonly shot: Omit<Shot, "change" | "strip">;
}

let browser: Browser | null = null;
/**
 * The clips' browser, with the machine's GPU where it has one: a clip is watched, not compared, and
 * software WebGL draws a town at 1440 x 900 three or four times a second, a slideshow.
 */
let filmer: Browser | null = null;
const GPU = process.platform === "darwin" ? ["--use-angle=metal"] : [];

async function shoot(page: Page, found: () => Promise<string[]>, base: Omit<Shot, "change" | "strip" | "sha256" | "issues" | "file" | "width" | "height" | "control" | "readout">, extra: { issues?: readonly string[]; fullPage?: boolean; level?: boolean } = {}): Promise<Taken> {
  const bytes = await page.screenshot({ type: "jpeg", quality: 82, fullPage: extra.fullPage ?? false });
  const dimensions = imageSize(bytes);
  const file = `shots/${base.key.replaceAll("/", "--")}.jpg`;
  writeFileSync(join(out, file), bytes);
  return {
    bytes,
    shot: {
      ...base,
      file,
      width: dimensions.width,
      height: dimensions.height,
      control: extra.level ? await controlOf(page) : null,
      readout: extra.level ? await readoutOf(page) : null,
      issues: [...(extra.issues ?? []), ...(await found())],
      sha256: sha256(bytes),
    },
  };
}
/** A JPEG's width and height, from its start-of-frame marker. */
function imageSize(bytes: Buffer): { width: number; height: number } {
  let at = 2;
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1] ?? 0;
    const length = bytes.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    at += 2 + length;
  }
  throw new Error("not a JPEG the atlas can read");
}

async function newPage(size: Size, reduced: boolean, on: Browser | null = browser): Promise<Page> {
  // A context of its own, as axe asks, closed with its page.
  if (!on) throw new Error("the atlas's browser is not open");
  const context = await on.newContext({ viewport: SIZES[size], deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  return page;
}

/** Each level's known issues: the hand-kept ones and the definitional rule's. */
function levelIssues(world: LibraryEntry, order: number): string[] {
  const known = KNOWN_ISSUES.filter((entry) => entry.world === world.id && entry.level === order).map((entry) => entry.issue);
  if (world.definitional.includes(order)) known.push("Definitional by the rule of 2026-10-18: its control is in the measured compartment's own equation and it measures that compartment's level or peak.");
  return known;
}

/** Every level of one world at one size, in every state. */
async function shootWorld(world: LibraryEntry, size: Size): Promise<Taken[]> {
  const page = await newPage(size, true);
  const found = watch(page);
  const taken: Taken[] = [];
  try {
    await page.goto(`${origin}${world.route}`);
    await stageReady(page);
    const ids = await levelIds(page);
    for (const [at, id] of ids.entries()) {
      if (at > 0) {
        await page.locator(`.level-map li[data-level="${id}"] button`).click();
        await page.locator(`main[data-level="${id}"]`).waitFor();
      }
      const order = world.levels[at]?.order ?? at + 1;
      const title = oneLine(await page.locator(".level-card h2").first().innerText()) ?? world.levels[at]?.title ?? id;
      const known = levelIssues(world, order);
      const base = (state: LevelState) => ({ key: `${world.id}/${order}/${state}/${size}`, world: world.id, route: world.route, size, state, label: `Level ${order}, ${state}`, level: { order, title } });
      const take = async (state: LevelState, issues: readonly string[] = []) => {
        await page.waitForTimeout(250);
        taken.push(await shoot(page, found, base(state), { issues: [...known, ...issues], level: true }));
        console.log(`  ${world.id} ${size} level ${order}: ${state}`);
      };

      await take("opened", await axeIssues(page));

      const slider = page.locator(".level-card input[type=range]").first();
      await slider.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("End");
      await take("moved");

      await page.locator(".level-whatif button").click();
      const choices = page.locator(".guide-choices button");
      await Promise.race([choices.first().waitFor(), page.locator("main[data-fork=open]").waitFor()]);
      if ((await page.locator("main[data-fork=open]").count()) === 0) {
        await take("prediction");
        await choices.first().click();
        await page.locator("main[data-fork=open]").waitFor();
      } else await take("prediction", ["What if opened the fork without asking for a prediction first."]);

      const fork = page.locator(".fork");
      const speed = fork.locator(".speed-button");
      if ((await speed.count()) > 0) {
        for (let presses = 0; presses < 3 && (await page.locator("main").getAttribute("data-speed")) !== "4"; presses++) await speed.click();
      }
      const playBoth = fork.getByRole("button", { name: "Play both" });
      if (await playBoth.isVisible().catch(() => false)) await playBoth.click();
      await page.waitForTimeout(1500);
      await take("fork-running");
      // A fork is done when its play button says so; a level in guided exploration shows no "holds" line.
      const finished = await fork
        .locator(".fork-buttons button", { hasText: "Done" })
        .waitFor({ timeout: FORK_LIMIT_MS })
        .then(() => true)
        .catch(() => false);
      await take("fork-finished", finished ? [] : [`The fork had not finished after ${FORK_LIMIT_MS / 1000} s at 4×.`]);
      await page.getByRole("button", { name: "Back to one world" }).first().click();
      await page.locator("main[data-fork=closed]").waitFor();

      await page.getByRole("button", { name: "Journal" }).click();
      await page.getByRole("complementary", { name: "Paper journal" }).waitFor();
      await take("journal");
      await page.getByRole("button", { name: "Close the journal" }).click();

      // On a phone the depth toggle shows once the card is expanded.
      const expand = page.locator(".level-card .level-expand");
      const collapsed = (await expand.count()) > 0 && (await expand.isVisible()) && (await expand.getAttribute("aria-expanded")) === "false";
      if (collapsed) await expand.click();
      await page.locator(".level-card").getByRole("radio", { name: "Advanced" }).check({ force: true });
      await take("depth");
      await page.locator(".level-card").getByRole("radio", { name: "Beginner" }).check({ force: true });
      if (collapsed) await expand.click();
    }
  } finally {
    await page.context().close();
  }
  return taken;
}

/** A 6-second clip of each level: the world playing, its control moved to the top of its range and back. */
async function filmWorld(world: LibraryEntry, size: Size): Promise<Clip[]> {
  const page = await newPage(size, false, filmer);
  const clips: Clip[] = [];
  try {
    await page.goto(`${origin}${world.route}`);
    await stageReady(page);
    const ids = await levelIds(page);
    for (const [at, id] of ids.entries()) {
      if (at > 0) {
        await page.locator(`.level-map li[data-level="${id}"] button`).click();
        await page.locator(`main[data-level="${id}"]`).waitFor();
      }
      const play = page.getByRole("button", { name: "Play", exact: true });
      if (await play.isVisible().catch(() => false)) await play.click();
      const slider = page.locator(".level-card input[type=range]").first();
      const frames: Buffer[] = [];
      const start = performance.now();
      let moved = 0;
      while (performance.now() - start < CLIP_SECONDS * 1000) {
        const elapsed = performance.now() - start;
        if (moved === 0 && elapsed > 1500) {
          await slider.focus();
          await page.keyboard.press("End");
          moved = 1;
        } else if (moved === 1 && elapsed > 3800) {
          await page.keyboard.press("Home");
          moved = 2;
        }
        frames.push(await page.screenshot({ type: "jpeg", quality: 70 }));
      }
      const seconds = (performance.now() - start) / 1000;
      // The next level opens once this one's control has been through its range.
      await slider.focus();
      await page.keyboard.press("End");
      const order = world.levels[at]?.order ?? at + 1;
      const file = `clips/${world.id}--${order}--${size}.webm`;
      await encode(frames, frames.length / seconds, join(out, file));
      clips.push({ world: world.id, level: order, size, file, seconds: CLIP_SECONDS, frames: frames.length });
      console.log(`  ${world.id} ${size} level ${order}: clip, ${frames.length} frames`);
    }
  } finally {
    await page.context().close();
  }
  return clips;
}

interface JobEventLine {
  readonly seq: number;
  readonly state: string;
  readonly step: string;
  readonly message: string;
  readonly at: string;
}

/**
 * The events of the job that made a world: its own job, if this machine ran it and kept the world as
 * the job made it; else the states its job record kept. Never another job's events: worlds of one
 * paper share a title, so a title names no job.
 */
function eventsOf(world: LibraryEntry): { events: JobEventLine[]; source: string; how: string; job: string } {
  const spec = readFileSync(join(root, "fixtures", "worldspecs", "generated", `${world.id}.json`), "utf8");
  const same: { id: string; events: JobEventLine[]; exact: boolean }[] = [];
  for (const folder of JOBS.filter((path) => existsSync(path))) {
    for (const id of readdirSync(folder)) {
      const made = join(folder, id, "world.json");
      const log = join(folder, id, "events.jsonl");
      if (!existsSync(made) || !existsSync(log)) continue;
      const text = readFileSync(made, "utf8");
      let candidate: unknown;
      try {
        candidate = JSON.parse(text);
      } catch {
        continue;
      }
      const exact = JSON.stringify(candidate) === JSON.stringify(JSON.parse(spec));
      if (!exact) continue;
      const events = readFileSync(log, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JobEventLine);
      if (events.at(-1)?.state !== "ready") continue;
      same.push({ id, events, exact });
    }
  }
  const sourceOf = (events: readonly JobEventLine[]): string => /received (\S+)/.exec(events[0]?.message ?? "")?.[1] ?? world.id;
  const exact = same.find((entry) => entry.exact);
  if (exact) return { events: exact.events, source: sourceOf(exact.events), how: `job ${exact.id}, the job that made this world`, job: exact.id };
  // No job on this machine: the recorded states, from the job record that names the world.
  const records = join(root, "fixtures", "jobs");
  for (const name of readdirSync(records)) {
    const record = JSON.parse(readFileSync(join(records, name), "utf8")) as { world?: string; states?: string[]; sourceId?: string };
    if (record.world === `fixtures/worldspecs/generated/${world.id}.json` && record.states) {
      const source = (record.sourceId ?? "").replace(/^arxiv-/, "arxiv:").replace(/^pmc-/, "pmc:");
      return {
        events: record.states.map((state, index) => ({ seq: index + 1, state, step: state, message: "a recorded state; this machine holds no event log of the job", at: "2026-10-18T00:00:00.000Z" })),
        source,
        how: `the states its job record, ${name}, kept`,
        job: name.replace(/\.json$/, ""),
      };
    }
  }
  return { events: [], source: world.id, how: "no job on this machine and no job record", job: "" };
}

async function shootStoryboard(world: LibraryEntry, size: Size): Promise<Taken | null> {
  const { events, source, how, job } = eventsOf(world);
  if (events.length === 0) return null;
  const page = await newPage(size, true);
  const found = watch(page);
  try {
    const stream = events.map((event, index) => `id: ${index + 1}\nevent: state\ndata: ${JSON.stringify({ ...event, jobId: job, seq: index + 1 })}\n\n`).join("");
    await page.route("**/api/jobs", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ jobId: job, state: "received" }) }));
    await page.route(`**/api/jobs/${job}/events`, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: stream }));
    await page.goto(`${origin}/create`);
    await page.getByLabel("Paper").fill(source);
    await page.getByRole("button", { name: "Make a world" }).click();
    await page.locator(`.storyboard[data-state="${events.at(-1)?.state ?? "ready"}"]`).waitFor();
    return await shoot(page, found, { key: `${world.id}/storyboard/${size}`, world: world.id, route: "/create", size, state: "storyboard", label: `The storyboard of ${how}`, level: null }, { fullPage: true });
  } finally {
    await page.context().close();
  }
}

const PAGES = [
  { name: "Library", route: "/library", full: true },
  { name: "Make a world from a paper", route: "/create", full: false },
  { name: "The lab bench", route: "/world/local", full: false },
  { name: "A path with nothing on it", route: "/no-such-page", full: false },
] as const;

async function shootPage(entry: (typeof PAGES)[number], size: Size): Promise<Taken> {
  const page = await newPage(size, true);
  const found = watch(page);
  try {
    // The library asks this machine's API what it has made; the atlas answers that it has made nothing.
    await page.route("**/api/jobs", (route) => route.fulfill({ json: { jobs: [] } }));
    await page.goto(`${origin}${entry.route}`);
    if (entry.route === "/world/local") await stageReady(page);
    await page.waitForTimeout(500);
    return await shoot(page, found, { key: `routes/${entry.route.replace(/\W+/g, "-")}/${size}`, world: "routes", route: entry.route, size, state: "page", label: entry.name, level: null }, { issues: await axeIssues(page), fullPage: entry.full });
  } finally {
    await page.context().close();
  }
}

// Picture work done in the browser, which decodes and draws JPEGs; written as source, as the other
// scripts write what they run in a page, since the scripts are typed for Node.
const DIFFERENCE = `async ([first, second]) => {
  const decode = async (base64) => createImageBitmap(await (await fetch("data:image/jpeg;base64," + base64)).blob());
  const [x, y] = await Promise.all([decode(first), decode(second)]);
  if (x.width !== y.width || x.height !== y.height) return 1;
  const pixels = (bitmap) => {
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  };
  const [p, q] = [pixels(x), pixels(y)];
  let differ = 0;
  for (let at = 0; at < p.length; at += 4) {
    if (Math.abs(p[at] - q[at]) > 24 || Math.abs(p[at + 1] - q[at + 1]) > 24 || Math.abs(p[at + 2] - q[at + 2]) > 24) differ++;
  }
  return differ / (p.length / 4);
}`;
const JOIN = `async (all) => {
  const bitmaps = await Promise.all(all.map(async (one) => createImageBitmap(await (await fetch("data:image/jpeg;base64," + one)).blob())));
  const width = bitmaps[0].width;
  const height = bitmaps[0].height;
  const canvas = new OffscreenCanvas(width * bitmaps.length, height);
  const context = canvas.getContext("2d");
  bitmaps.forEach((bitmap, index) => context.drawImage(bitmap, index * width, 0, width, height));
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
  let text = "";
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}`;

/** How much of a picture differs from the last atlas's: the share of pixels with a channel off by more than 24. */
async function difference(tool: Page, a: Buffer, b: Buffer): Promise<number> {
  return Number(await tool.evaluate(`(${DIFFERENCE})(${JSON.stringify([a.toString("base64"), b.toString("base64")])})`));
}

/** A level's shots at one size joined side by side, in state order: one file for the artifact instead of seven. */
async function joinStrip(tool: Page, pictures: readonly Buffer[]): Promise<Buffer> {
  const base64 = String(await tool.evaluate(`(${JOIN})(${JSON.stringify(pictures.map((picture) => picture.toString("base64")))})`));
  return Buffer.from(base64, "base64");
}

/** Shots taken before the atlas existed, kept in its folder under earlier/<world>/<set>/. */
function earlierSets(): EarlierSet[] {
  const folder = join(out, "earlier");
  if (!existsSync(folder)) return [];
  const sets: EarlierSet[] = [];
  for (const world of readdirSync(folder).sort()) {
    for (const set of readdirSync(join(folder, world)).sort()) {
      const files = readdirSync(join(folder, world, set))
        .filter((name) => /\.(png|jpe?g)$/.test(name))
        .sort();
      const note = existsSync(join(folder, world, set, "about.txt")) ? readFileSync(join(folder, world, set, "about.txt"), "utf8").trim() : set;
      sets.push({ world, label: note, files: files.map((name) => ({ file: `earlier/${world}/${set}/${name}`, caption: name.replace(/\.\w+$/, "").replace(/-/g, " ") })) });
    }
  }
  return sets;
}

// ── The run ────────────────────────────────────────────────────────────────────────────────────
// With --redo clips or --redo storyboards, that part of an atlas already taken is taken again and its
// gallery rewritten; the rest is kept as it was.
const REDO = argument("--redo");
if (REDO !== null && REDO !== "clips" && REDO !== "storyboards") throw new Error(`--redo takes clips or storyboards, not ${REDO}`);
if (REDO && !existsSync(join(out, "manifest.json"))) throw new Error(`--redo takes again part of an atlas already taken, and ${out} has none`);
for (const folder of REDO === "clips" ? ["clips"] : REDO ? [] : ["shots", "strips", "clips"]) {
  rmSync(join(out, folder), { recursive: true, force: true });
  mkdirSync(join(out, folder), { recursive: true });
}
const previous = previousAtlas();
const server = spawn("npm", ["run", "dev", "--workspace", "@paperplay/web", "--", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "ignore" });
try {
  await waitFor(origin, 60);
  browser = await chromium.launch({ args: SWIFTSHADER });
  const taken: Taken[] = [];
  const clips: Clip[] = [];
  const failures: string[] = [];
  const failed = (what: string) => (error: unknown) => void failures.push(`${what}: ${error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error)}`);
  // The shots: one task per world and size, a few at a time, as a fork runs to its horizon.
  const tasks: (() => Promise<void>)[] = [];
  for (const size of ["desktop", "phone"] as const) {
    if (REDO === "clips") break;
    if (REDO === "storyboards") {
      for (const world of library.filter((entry) => entry.madeBy === "pipeline")) tasks.push(() => shootStoryboard(world, size).then((board) => void (board && taken.push(board)), failed(`${world.id}'s storyboard at ${size}`)));
      continue;
    }
    if (!ONLY) for (const entry of PAGES) tasks.push(() => shootPage(entry, size).then((shot) => void taken.push(shot), failed(`${entry.route} at ${size}`)));
    for (const world of library) {
      tasks.push(async () => {
        console.log(`${world.id} at ${size}`);
        await shootWorld(world, size).then((shots) => void taken.push(...shots), failed(`${world.id} at ${size}`));
        if (world.madeBy === "pipeline") await shootStoryboard(world, size).then((board) => void (board && taken.push(board)), failed(`${world.id}'s storyboard at ${size}`));
      });
    }
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < tasks.length) await tasks[next++]?.();
    }),
  );
  // Then the clips, one world at a time, so each has the GPU to itself.
  if (REDO !== "storyboards") {
    filmer = await chromium.launch({ args: GPU });
    for (const size of ["desktop", "phone"] as const) {
      for (const world of library) await filmWorld(world, size).then((made) => void clips.push(...made), failed(`${world.id}'s clips at ${size}`));
    }
    await filmer.close();
  }
  // In the order the gallery reads them, whatever order the workers finished in.
  taken.sort((a, b) => a.shot.key.localeCompare(b.shot.key));
  clips.sort((a, b) => a.world.localeCompare(b.world) || a.level - b.level || a.size.localeCompare(b.size));

  let atlas: Atlas;
  if (REDO) {
    const kept = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as Atlas;
    const retaken = new Map(taken.map(({ shot }) => [shot.key, shot]));
    const shots = kept.shots.map((shot) => {
      const again = retaken.get(shot.key);
      return again ? { ...again, change: shot.change, strip: shot.strip } : shot;
    });
    atlas = { ...kept, shots, clips: REDO === "clips" ? clips : kept.clips, earlier: earlierSets() };
  } else {
    // Compare with the last atlas, and join each level's shots at each size into a strip.
    const tool = await browser.newPage();
    const before = new Map((previous?.atlas.shots ?? []).map((shot) => [shot.key, shot]));
    const shots: Shot[] = [];
    for (const { bytes, shot } of taken) {
      const old = before.get(shot.key);
      let change: Change;
      if (!previous) change = { kind: "first" };
      else if (shot.state === "fork-running") change = { kind: "not-compared", why: "taken mid-run, so it differs with timing" };
      else if (!old) change = { kind: "new" };
      else if (old.sha256 === shot.sha256) change = { kind: "same" };
      else {
        const path = join(ATLASES, previous.name, old.file);
        const fraction = existsSync(path) ? await difference(tool, bytes, readFileSync(path)) : 1;
        change = fraction > 0.002 ? { kind: "changed", fraction } : { kind: "same" };
      }
      shots.push({ ...shot, change, strip: null });
    }
    const pictures = new Map(taken.map(({ bytes, shot }) => [shot.key, bytes]));
    for (const world of library) {
      for (const level of world.levels) {
        for (const size of ["desktop", "phone"] as const) {
          const keys = LEVEL_STATES.map((state) => `${world.id}/${level.order}/${state}/${size}`).filter((key) => pictures.has(key));
          if (keys.length === 0) continue;
          const file = `strips/${world.id}--${level.order}--${size}.jpg`;
          writeFileSync(join(out, file), await joinStrip(tool, keys.map((key) => pictures.get(key) as Buffer)));
          keys.forEach((key, index) => {
            const at = shots.findIndex((shot) => shot.key === key);
            const shot = shots[at];
            if (shot) shots[at] = { ...shot, strip: { file, index, count: keys.length } };
          });
        }
      }
    }
    await tool.close();
    const worlds: AtlasWorld[] = library.map((world) => ({
      id: world.id,
      title: world.title,
      route: world.route,
      status: world.status,
      family: world.family,
      paper: world.paper.title,
      levels: world.levels,
      issues: KNOWN_ISSUES.filter((entry) => entry.world === world.id && entry.level === null).map((entry) => entry.issue),
    }));
    atlas = { schemaVersion: "atlas/1", date: DATE, commit, previous: previous?.name ?? null, worlds, shots, clips, earlier: earlierSets() };
  }
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(atlas, null, 2)}\n`);
  writeFileSync(join(out, "index.html"), galleryPage(atlas));
  writeFileSync(join(out, "artifact.html"), galleryContent(atlas, { published: true }));
  console.log(`atlas: ${atlas.shots.length} shots and ${atlas.clips.length} clips in ${out}; open index.html`);
  if (failures.length > 0) {
    console.error(`atlas: ${failures.length} ${failures.length === 1 ? "part" : "parts"} failed:\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await filmer?.close();
  server.kill();
}
