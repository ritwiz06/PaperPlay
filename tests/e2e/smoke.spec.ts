import { expect, test } from "@playwright/test";

// Wiring check for the web app and the Playwright toolchain. The local world's
// requirement evidence ([R04]) arrives with /world/local in a later G1 slice.
test("the app shell loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "PaperPlay" })).toBeVisible();
  expect(errors).toEqual([]);
});
