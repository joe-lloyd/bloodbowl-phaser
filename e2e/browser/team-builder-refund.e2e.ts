import { test, expect } from "@playwright/test";

test("a draft team removes re-rolls and cheerleaders it bought and gets the gold back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  await page.getByTestId("roster-choice-Human").click();
  const staff = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "SIDELINE STAFF" }) });
  const gold = staff.getByText(/^Gold /);
  const startingGold = await gold.textContent();

  await expect(staff.getByLabel("Remove one Re-Rolls")).toBeDisabled();
  await staff.getByLabel("Add one Re-Rolls").click();
  await staff.getByLabel("Add one Re-Rolls").click();
  await staff.getByLabel("Add one Cheerleaders").click();
  await expect(gold).not.toHaveText(String(startingGold));
  await staff.screenshot({
    path: test.info().outputPath("staff-bought.png"),
  });

  await staff.getByLabel("Remove one Re-Rolls").click();
  await staff.getByLabel("Remove one Re-Rolls").click();
  await staff.getByLabel("Remove one Cheerleaders").click();

  await expect(gold).toHaveText(String(startingGold));
  await expect(staff.getByLabel("Remove one Re-Rolls")).toBeDisabled();
  await expect(staff.getByLabel("Remove one Cheerleaders")).toBeDisabled();
  await staff.screenshot({
    path: test.info().outputPath("staff-removed.png"),
  });
});
