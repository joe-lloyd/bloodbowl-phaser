import { test, expect } from "@playwright/test";

test("loads the game shell headlessly with no page errors", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "BLOOD BOWL", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Play Local" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
