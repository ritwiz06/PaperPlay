import { expect, test, type Page } from "@playwright/test";
import { flockDefaultParams, flockPlanarWeighted as flock } from "@paperplay/primitives";
import { coveredFraction, type Rect } from "../../packages/ui/src/stage-core/index.ts";
import { HOOK_SEED } from "../../apps/web/src/world/local-world.ts";

// /world/hook on the game-first shell (ADR-0008, and the owner's review of the spike). Each
// test emulates reduced motion, so the world opens still and the guide has no animation.

const SIZES = [
  { name: "desktop", width: 1440, height: 900, limit: 0.25 },
  { name: "phone", width: 390, height: 844, limit: 0.35 },
] as const;

const stage = (page: Page) => page.getByRole("application", { name: "World stage" });
const rectOf = async (page: Page, attribute: string): Promise<Rect> => JSON.parse((await stage(page).getAttribute(attribute)) ?? "null") as Rect;

/** Opens the hook still, and waits until the stage has framed the field in the room the HUD leaves. */
async function openHook(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world/hook");
  await expect.poll(async () => Number((await stage(page).getAttribute("data-frames")) ?? 0)).toBeGreaterThan(0);
  const viewport = page.viewportSize();
  await expect.poll(async () => {
    const free = await rectOf(page, "data-free-rect");
    return free !== null && viewport !== null && (free.x > 0 || free.y > 0 || free.width < viewport.width || free.height < viewport.height);
  }).toBe(true);
}

/** Every HUD box a viewer can see: hidden and transparent parts, such as the resting guide's bubble, do not count. */
async function hudBoxes(page: Page, selector = "[data-hud]"): Promise<Rect[]> {
  return page.evaluate((query) => {
    return [...document.querySelectorAll<HTMLElement>(query)]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0;
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.left, y: box.top, width: box.width, height: box.height };
      });
  }, selector);
}

const inside = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test(`the HUD at rest covers at most ${size.limit * 100}% of the screen, on a ${size.name}`, async ({ page }) => {
      await openHook(page);
      const boxes = await hudBoxes(page);
      expect(boxes.length).toBeGreaterThanOrEqual(5);
      const covered = coveredFraction({ width: size.width, height: size.height }, boxes);
      test.info().annotations.push({ type: "HUD coverage", description: `${(covered * 100).toFixed(1)}%` });
      expect(covered).toBeLessThanOrEqual(size.limit);
    });

    test(`the stage frames the whole field inside the rectangle the HUD leaves free, on a ${size.name}`, async ({ page }) => {
      await openHook(page);
      const free = await rectOf(page, "data-free-rect");
      const field = await rectOf(page, "data-field-bounds");
      expect(inside(free, field), JSON.stringify({ free, field })).toBe(true);
      for (const box of await hudBoxes(page, "[data-hud-frame]")) {
        const apart = free.x + free.width <= box.x || free.x >= box.x + box.width || free.y + free.height <= box.y || free.y >= box.y + box.height;
        expect(apart, JSON.stringify({ free, box })).toBe(true);
      }
    });
  });
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("[R05] From the paper opens the journal at the control's passage, and tapping the passage focuses the control", async ({ page }) => {
    await openHook(page);
    const journal = page.getByRole("complementary", { name: "Paper journal" });
    await expect(journal).toBeHidden();

    await page.getByRole("button", { name: "From the paper", exact: true }).click();
    await expect(journal).toBeVisible();
    const pageForHook = journal.locator('[data-page="hook"]');
    await expect(pageForHook).toHaveClass(/highlighted/);
    const passage = pageForHook.getByRole("button", { name: /Try it: Move together/ });
    await expect(passage).toBeFocused();
    await expect(passage).toContainText("Placeholder");

    await passage.click();
    await expect(page.getByRole("slider", { name: "Move together" })).toBeFocused();
  });

  test("[R05] while the journal is open, focusing the control highlights its passage", async ({ page }) => {
    await openHook(page);
    await page.getByRole("button", { name: "Journal" }).click();
    const pageForHook = page.locator('[data-page="hook"]');
    await expect(pageForHook).not.toHaveClass(/highlighted/);
    await page.getByRole("slider", { name: "Move together" }).focus();
    await expect(pageForHook).toHaveClass(/highlighted/);
  });

  test("[R05] the control's chip says its rule is paper-derived, a placeholder until the source map; its name and range are teaching choices in the journal", async ({ page }) => {
    await openHook(page);
    const card = page.getByRole("region", { name: "A flock with no leader" });
    await expect(card.locator(".control-line .origin-tag")).toHaveText(/Paper.*placeholder/);
    await expect(card.locator(".control-line .origin-tag-teaching-choice")).toHaveCount(0);
    await page.getByRole("button", { name: "Journal" }).click();
    const detail = page.locator('[data-page="hook"] .page-detail');
    await expect(detail).toContainText("Called “Move together” here. It runs from 0, ignore neighbours, to 4, follow closely");
    await expect(detail.locator(".origin-tag-teaching-choice").first()).toBeVisible();
  });

  test("[R06] the depth toggle changes what the level shows: words at Beginner, numbers from Intermediate, the equation at Advanced", async ({ page }) => {
    await openHook(page);
    const card = page.getByRole("region", { name: "A flock with no leader" });
    const start = flock.measure(flock.init(flockDefaultParams, HOOK_SEED)).directionalAgreement;

    await card.getByText("Beginner", { exact: true }).click();
    await expect(card.locator(".slider-ends")).toHaveText(/Ignore neighbours\s*Follow closely/);
    await expect(card.locator(".value-pill")).toHaveCount(0);
    await expect(card.locator(".compass.with-number")).toHaveCount(0);

    await card.getByText("Intermediate", { exact: true }).click();
    await expect(card.locator(".value-pill")).toHaveText("2.00");
    await expect(card.locator(".compass.with-number .compass-number")).toBeVisible();
    // The compass shows the primitive's own measure, at full precision in data-value.
    expect(Number(await card.locator(".compass-number").getAttribute("data-value"))).toBe(start);

    await card.getByText("Advanced", { exact: true }).click();
    await expect(card.locator(".level-advanced")).toContainText("Aᵢ = w_a (ūᵢ − vᵢ)");
  });

  test("the guide appears when the learner acts, fades after about six seconds, and its icon brings it back", async ({ page }) => {
    await openHook(page);
    const bubble = page.getByRole("group", { name: "Guide" });
    await expect(bubble).toBeHidden();

    const slider = page.getByRole("slider", { name: "Move together" });
    await slider.focus();
    await page.keyboard.press("End");
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("You raised Move together");
    await expect(bubble.locator(".origin-tag-computed-observation")).toBeVisible();

    await expect(bubble).toBeHidden({ timeout: 8000 });
    await page.getByRole("button", { name: "Show what the guide said last" }).click();
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("You raised Move together");
  });
});

test.describe("the following camera", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("comes closer and keeps the flock's centre inside the rectangle the HUD leaves free", async ({ page }) => {
    await page.goto("/world/hook");
    const view = stage(page);
    await expect(view).toHaveAttribute("data-framing", "follow");
    await expect(view).toHaveAttribute("data-look", "heading");
    await expect.poll(async () => Number((await view.getAttribute("data-frames")) ?? 0), { timeout: 15_000 }).toBeGreaterThan(30);
    const free = await rectOf(page, "data-free-rect");
    const focus = JSON.parse((await view.getAttribute("data-focus")) ?? "null") as { x: number; y: number };
    expect(inside(free, { ...focus, width: 0, height: 0 }), JSON.stringify({ free, focus })).toBe(true);
    // Closer than the overview: the field now overflows the free rectangle.
    const field = await rectOf(page, "data-field-bounds");
    expect(field.width).toBeGreaterThan(free.width);
  });

  test("stays the still overview under reduced motion", async ({ page }) => {
    await openHook(page);
    const free = await rectOf(page, "data-free-rect");
    const focus = JSON.parse((await stage(page).getAttribute("data-focus")) ?? "null") as { x: number; y: number };
    // The view is centred in the free rectangle.
    expect(Math.abs(focus.x - (free.x + free.width / 2))).toBeLessThan(2);
    expect(Math.abs(focus.y - (free.y + free.height / 2))).toBeLessThan(2);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the level card rests as one compact row, and its chevron opens the goal and the depth toggle", async ({ page }) => {
    await openHook(page);
    const card = page.getByRole("region", { name: "A flock with no leader" });
    await expect(card.getByText("Slide Move together")).toBeHidden();
    await expect(card.getByRole("radiogroup", { name: "How deep to go" }).or(card.locator(".depth-toggle"))).toBeHidden();
    await expect(page.getByRole("slider", { name: "Move together" })).toBeVisible();
    await expect(card.getByRole("button", { name: "What if" })).toBeVisible();

    await card.getByRole("button", { name: "Show the goal and depth" }).click();
    await expect(card.getByText("Slide Move together")).toBeVisible();
    await expect(card.locator(".depth-toggle")).toBeVisible();
  });

  test("[R05] tapping the passage steps the journal aside and focuses the control", async ({ page }) => {
    await openHook(page);
    await page.getByRole("button", { name: "From the paper: Move together" }).click();
    const journal = page.getByRole("complementary", { name: "Paper journal" });
    await expect(journal).toBeVisible();
    await journal.getByRole("button", { name: /Try it: Move together/ }).click();
    await expect(journal).toBeHidden();
    await expect(page.getByRole("slider", { name: "Move together" })).toBeFocused();
  });
});
