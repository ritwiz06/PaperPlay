import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// A job's world while its levels are still arriving (R13, ADR-0053): the heat-plate fixture served
// as a running job's released levels, its module beside them. The note that says so sits in the
// HUD's own flow, clear of every card there; it never lies over the fork, which covers the HUD, nor
// over the paper journal, which it steps aside for; its button fetches the newest levels; and every
// state passes the axe scan, at a desktop size and on a phone. Screenshots go to
// ARRIVING_SCREENSHOTS when it is set.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const JOB = "job-arriving";
const kept = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "mechanisms", "heat-plate.world.json"), "utf8")) as { world: { levels: { title: string }[] }; mechanism: unknown };
const shots = process.env["ARRIVING_SCREENSHOTS"];

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Opens the job's world, its levels released and its events empty unless given; resolves once the stage has drawn. */
async function openJob(page: Page, events = ""): Promise<{ readonly released: () => number }> {
  let released = 0;
  await page.route(`**/api/jobs/${JOB}/world`, (route) => route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "the job is still running" }) }));
  await page.route(`**/api/jobs/${JOB}/released`, (route) => {
    released += 1;
    const levels = kept.world.levels.map((level, index) => ({ level: index + 1, title: level.title }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ levels, of: 3, reviewed: false, world: kept.world }) });
  });
  await page.route(`**/api/jobs/${JOB}/artifacts/mechanism`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(kept.mechanism) }));
  await page.route(`**/api/jobs/${JOB}/events`, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: events }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/world/job/${JOB}`);
  await expect.poll(async () => Number((await page.locator(".game > .stage-mechanism canvas").getAttribute("data-frames")) ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
  return { released: () => released };
}

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map((violation) => `${violation.id}: ${violation.help}. ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`);
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Whether the note lies over the other: never when the note is not on screen. */
async function noteOver(note: Locator, other: Locator): Promise<{ over: boolean; note: Box | null; other: Box | null }> {
  if (!(await note.isVisible())) return { over: false, note: null, other: null };
  const [mine, theirs] = [await note.boundingBox(), await other.boundingBox()];
  return { over: mine !== null && theirs !== null && overlaps(mine, theirs), note: mine, other: theirs };
}

for (const size of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const) {
  test.describe(`a job's world still arriving, at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`[R12] [R13] says its levels are still arriving, clear of the HUD, the fork and the journal, on a ${size.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await openJob(page);
      const note = page.getByRole("status").filter({ hasText: "Still being made" });
      await expect(note).toBeVisible();
      await expect(note).toContainText("Still being made: 3 of 3 levels have passed every check and are playable; the reviewers have not read them yet.");

      // A Beginner reads the explainer's words for the value, never "as measured".
      const reading = page.locator("[data-observable='mean']").first();
      await expect.poll(async () => Number(await reading.getAttribute("data-value"))).toBeGreaterThan(0);
      await expect(reading).toHaveText(/^(hot|warm|cool)$/);

      // At rest it lies clear of every card the HUD holds.
      const frames = page.locator("[data-hud-frame]:not(.hud-notice)");
      expect(await frames.count()).toBeGreaterThanOrEqual(4);
      for (const frame of await frames.all()) {
        const found = await noteOver(note, frame);
        expect(found.over, JSON.stringify(found)).toBe(false);
      }
      expect(await violations(page)).toEqual([]);
      if (shots) await page.screenshot({ path: join(shots, `arriving-${size.name}-rest.png`) });

      await page.locator(".level-whatif").getByRole("button", { name: "What if" }).click();
      await page.locator(".guide-choices button").first().click();
      const fork = page.locator(".fork");
      await expect(page.locator("main")).toHaveAttribute("data-fork", "open");
      await expect(fork).toBeVisible();
      for (const part of [fork, fork.locator(".fork-head")]) {
        const found = await noteOver(note, part);
        expect(found.over, JSON.stringify(found)).toBe(false);
      }
      expect(await violations(page)).toEqual([]);
      if (shots) await page.screenshot({ path: join(shots, `arriving-${size.name}-fork.png`) });
      await page.getByRole("button", { name: "Back to one world" }).click();
      await expect(note).toBeVisible();

      await page.getByRole("button", { name: "Journal" }).click();
      const journal = page.getByRole("complementary", { name: "Paper journal" });
      await expect(journal).toBeVisible();
      const found = await noteOver(note, journal);
      expect(found.over, JSON.stringify(found)).toBe(false);
      expect(await violations(page)).toEqual([]);
      if (shots) await page.screenshot({ path: join(shots, `arriving-${size.name}-journal.png`) });
      await page.getByRole("button", { name: "Close the journal" }).click();
      await expect(note).toBeVisible();
      expect(errors).toEqual([]);
    });

    test(`[R13] shows the newest levels when the job releases more, on a ${size.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      const job = await openJob(page, `event: state\ndata: ${JSON.stringify({ step: "release", state: "running" })}\n\n`);
      const newest = page.getByRole("button", { name: "Show the newest levels" });
      await expect(newest).toBeVisible();
      // A development server's strict mode loads twice on opening, so the count is read, not assumed.
      const before = job.released();
      await newest.click();
      await expect.poll(() => job.released()).toBeGreaterThan(before);
      await expect.poll(async () => Number((await page.locator(".game > .stage-mechanism canvas").getAttribute("data-frames")) ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(page.getByRole("status").filter({ hasText: "Still being made" })).toBeVisible();
    });
  });
}
