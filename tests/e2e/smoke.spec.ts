import { expect, test } from "@playwright/test";

// Wiring checks for the web app and the Playwright toolchain. The local world's requirement
// evidence ([R04]) is in world.spec.ts.
test("the app shell loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Murmuration Valley" })).toBeVisible();
  await expect(page.getByText("PaperPlay", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an unknown path says so and links back to the world", async ({ page }) => {
  await page.goto("/no/such/page");
  await expect(page.getByRole("heading", { level: 1, name: "Nothing here" })).toBeVisible();
  await page.getByRole("link", { name: "Go to Murmuration Valley" }).click();
  await expect(page).toHaveURL(/\/world\/local$/);
});
