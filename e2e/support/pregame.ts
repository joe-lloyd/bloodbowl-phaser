import { fixtureValue } from "../../src/testing/fixtureValue";
import { expect, type Page } from "@playwright/test";

export async function confirmPregame(page: Page): Promise<void> {
  const confirm = page.getByRole("button", {
    name: "Confirm — no purchases",
    exact: true,
  });
  await expect(confirm).toBeVisible({ timeout: 45_000 });
  const firstCoach = await page
    .getByRole("heading", { name: /^Inducements —/ })
    .textContent();
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: fixtureValue(firstCoach), exact: true })
  ).toHaveCount(0);
  if (await confirm.isVisible()) await confirm.click();
  await expect(
    page.getByRole("button", { name: "FLIP COIN", exact: true })
  ).toBeVisible({ timeout: 15_000 });
}
