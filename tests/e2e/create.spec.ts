import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// /create on the development server (ADR-0033): the storyboard shows a job's real states as the
// API streams them, a repair under the stage it repairs, and an ending in the job's own words.
// The API is answered here by Playwright, with a job's events written out, so no server or model
// is needed. There is no progress bar and no time estimate.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const JOB = "job-0001";

type Step = readonly [state: string, step: string, message: string];

const stream = (steps: readonly Step[]): string =>
  steps
    .map(([state, step, message], index) => {
      const event = { jobId: JOB, seq: index + 1, at: "2026-10-14T12:00:00.000Z", state, step, message };
      return `id: ${index + 1}\nevent: state\ndata: ${JSON.stringify(event)}\n\n`;
    })
    .join("");

async function answer(page: Page, steps: readonly Step[]): Promise<void> {
  await page.route("**/api/jobs", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ jobId: JOB, state: "received" }) }));
  await page.route(`**/api/jobs/${JOB}/events`, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: stream(steps) }));
}

const READY: readonly Step[] = [
  ["received", "received", "the request is in"],
  ["parsing", "ingest", "arXiv 2506.19869v1, cc-by: 32 sections, 42 equations"],
  ["planning", "route", "compartments, tier A"],
  ["planning", "match", "the two transcriptions agree structurally"],
  ["building", "build", "the world builds"],
  ["running", "level-rule", "level 2 holds on 7 of 20 starts"],
  ["repairing", "level-rule", "asking the planner to change level 2 alone"],
  ["building", "build", "the world builds"],
  ["running", "level-rule", "every level holds on 20 of 20 starts"],
  ["checking", "provenance", "every anchor is in the source"],
  ["ready", "ready", "built and checked"],
];

async function start(page: Page): Promise<void> {
  await page.goto("/create");
  await page.getByLabel("Paper").fill("arxiv:2506.19869v1");
  await page.getByRole("button", { name: "Make a world" }).click();
}

test("[R11] /create shows a job's real states as they stream, a repair where it happened, and a way to play the world", async ({ page }) => {
  await answer(page, READY);
  await start(page);
  const board = page.getByRole("region", { name: `Job ${JOB}` });
  await expect(board.getByRole("link", { name: "Play the world" })).toHaveAttribute("href", `/world/job/${JOB}`);
  for (const step of ["received", "parsing", "planning", "building", "running", "checking", "ready"]) {
    await expect(board.locator(`[data-step="${step}"]`)).toHaveClass(/story-done/);
  }
  await expect(board.locator('[data-step="running"] .story-repair')).toHaveText("Repair: asking the planner to change level 2 alone");
  await expect(board.getByText("the two transcriptions agree structurally")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("[R11] /create says exactly why a job stopped, and offers no world", async ({ page }) => {
  await answer(page, [
    ["received", "received", "the request is in"],
    ["parsing", "ingest", "PMC12334037, cc-by"],
    ["planning", "match", "the two transcriptions disagree"],
    ["repairing", "match", "the first transcriber is shown what differs"],
    ["planning", "match", "the two transcriptions still disagree"],
    ["needs_information", "match", "the two transcriptions still disagree: gamma is 0.48 in one and 0.225 in the other. The model is not verified, so the owner decides."],
  ]);
  await start(page);
  const ending = page.getByRole("status");
  await expect(ending.getByRole("heading", { name: "Needs your decision" })).toBeVisible();
  await expect(ending).toContainText("gamma is 0.48 in one and 0.225 in the other");
  await expect(page.getByRole("link", { name: "Play the world" })).toHaveCount(0);
  await expect(page.locator('[data-step="ready"]')).toHaveClass(/story-waiting/);
});

test("[R12] /create passes the axe scan with a finished storyboard at a desktop size and at 360 px", async ({ page }) => {
  await answer(page, READY);
  for (const size of [
    { width: 1280, height: 720 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(size);
    await start(page);
    await expect(page.getByRole("link", { name: "Play the world" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join("; ")}`), `${size.width} px`).toEqual([]);
  }
});

test("[R09] the production build has no /create: the public site only plays worlds built beforehand", async ({ page }) => {
  let called = false;
  await page.route("**/api/**", (route) => {
    called = true;
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4318/create");
  await expect(page.getByRole("heading", { name: "Make a world from a paper" })).toHaveCount(0);
  await expect(page.getByLabel("Paper")).toHaveCount(0);
  expect(called).toBe(false);
});

test("[R09] the production build plays a world generated beforehand, with no API", async ({ page }) => {
  let called = false;
  await page.route("**/api/**", (route) => {
    called = true;
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4318/world/generated/pmc-PMC12334037");
  await expect(page.getByRole("heading", { name: "HCV adherence in Zimbabwe", level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/A PaperPlay world about “Modeling the effects of treatment adherence/)).toBeVisible();
  await expect(page.getByRole("slider", { name: /Treatment adherence/ })).toBeVisible();
  expect(called).toBe(false);
});
