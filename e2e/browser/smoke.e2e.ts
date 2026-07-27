/**
 * Proves headless Chromium can load the built game shell: the Vite server
 * boots, the React router renders the main menu, and no page error escapes.
 * Everything downstream in browser-gameplay assumes this holds.
 */

import { test, expect } from "@playwright/test";

test("loads the game shell headlessly with no page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BLOOD BOWL SEVENS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Local" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
