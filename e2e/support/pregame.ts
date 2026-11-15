import { expect, Page } from "@playwright/test";

/**
 * Buy nothing on each inducement turn this screen owns, then wait for the
 * toss. The weather ready-up has already readied both teams. Teams buy in
 * turn: hotseat confirms twice, and the computer buys its own.
 */
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
    page.getByRole("heading", { name: firstCoach!, exact: true })
  ).toHaveCount(0);
  if (await confirm.isVisible()) await confirm.click();
  await expect(
    page.getByRole("button", { name: "FLIP COIN", exact: true })
  ).toBeVisible({ timeout: 15_000 });
}
