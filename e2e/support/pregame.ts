import { expect, type Page } from "@playwright/test";

export async function confirmPregame(page: Page): Promise<void> {
  const confirm = page.getByRole("button", {
    name: "Confirm — no purchases",
    exact: true,
  });
  const toss = page.getByRole("button", { name: "FLIP COIN", exact: true });
  await expect(confirm.or(toss)).toBeVisible({ timeout: 45_000 });
  if (await confirm.isVisible()) await confirm.click();
  await expect(toss).toBeVisible({ timeout: 15_000 });
}
