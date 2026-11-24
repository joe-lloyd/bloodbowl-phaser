import { expect, type Page } from "@playwright/test";

export async function pickFormation(page: Page, name: RegExp): Promise<void> {
  await page.getByTestId("formation-menu").click();
  const grid = page.getByTestId("formation-grid");
  await expect(grid.getByTestId("formation-thumb").first()).toBeVisible();
  await grid.getByRole("option", { name }).click();
  await expect(grid).toHaveCount(0);
}
