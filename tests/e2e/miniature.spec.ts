import { expect, test } from "@playwright/test";

// The trained miniature in the browser (ADR-0057): every number of one forward pass on a held-out
// input, hashed, must be Node's to the bit (packages/primitives/test/attention.miniature.test.ts
// pins the same digest). Chromium only here; it is the browser this suite installs.

export const MINIATURE_DIGEST = "0793fcc704ad35c433e7b06e569b962bc2c0b52c33906170d4c77b8f12f91170";

test("[R01] the trained miniature computes the same bits in the browser as in Node", async ({ page }) => {
  await page.goto("/check/miniature");
  const output = page.locator("output[data-digest]");
  await expect(output).not.toHaveAttribute("data-digest", "", { timeout: 30_000 });
  await expect(output).toHaveAttribute("data-digest", MINIATURE_DIGEST);
});
