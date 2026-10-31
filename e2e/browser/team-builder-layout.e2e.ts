/**
 * The team builder scrolls as one page. The hire list sizes to its rows,
 * so the wheel never lands in a second scroll box full of empty space.
 */
import { test, expect } from "@playwright/test";

test("the available hires list has no inner vertical scroll at 1440x900", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  await page.getByRole("combobox").first().selectOption("Vampire");
  const hires = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "AVAILABLE HIRES" }) });
  await expect(hires.getByRole("row")).toHaveCount(6);

  const scrollBoxes = await hires.evaluate((panel) =>
    [panel, ...panel.querySelectorAll<HTMLElement>("*")]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
      .map((el) => `${el.className}: ${el.scrollHeight} > ${el.clientHeight}`)
  );
  expect(scrollBoxes).toEqual([]);
});
