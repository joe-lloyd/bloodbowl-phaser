import { test, expect } from "@playwright/test";

test("a coach who is not an admin never sees or reaches Deathbowl Sevens @online", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Deathbowl/i })).toHaveCount(0);

  for (const path of ["/deathbowl", "/deathbowl/play"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  }
});
