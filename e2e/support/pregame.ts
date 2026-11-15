import { expect, Page } from "@playwright/test";

/** Ready the locally controlled coaches and explicitly buy nothing before the toss. */
export async function confirmPregame(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "READY FOR THE MATCH" })
  ).toBeVisible({ timeout: 45_000 });
  const ready = page.getByRole("button", { name: /^Ready —/ });
  while (await ready.count()) await ready.first().click();
  const confirm = page.getByRole("button", {
    name: "Confirm — no purchases",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  const firstCoach = await page
    .getByRole("heading", { name: /^Inducements —/ })
    .textContent();
  await confirm.click();
  await expect(
    page.getByRole("heading", { name: firstCoach!, exact: true })
  ).toHaveCount(0);
  // Hotseat has two confirmations; the computer confirms its own team.
  if (await confirm.isVisible()) await confirm.click();
  await expect(
    page.getByRole("button", { name: "FLIP COIN", exact: true })
  ).toBeVisible({ timeout: 15_000 });
}
