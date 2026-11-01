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

test("a skill tooltip on the last hire opens whole, outside the table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  await page.getByRole("combobox").first().selectOption("Vampire");
  const hires = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "AVAILABLE HIRES" }) });
  const trigger = hires
    .getByRole("row")
    .last()
    .locator('span[tabindex="0"]')
    .first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.hover();
  const tip = page.locator(
    `[id="${await trigger.getAttribute("aria-describedby")}"]`
  );
  await expect(tip).toBeVisible();
  const box = (await tip.boundingBox())!;
  // Fully on screen, and no scroll box grew to fit it
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);
  const scrollBoxes = await hires.evaluate(
    (panel) =>
      [panel, ...panel.querySelectorAll<HTMLElement>("*")].filter(
        (el) =>
          el.scrollHeight > el.clientHeight + 1 &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY)
      ).length
  );
  expect(scrollBoxes).toBe(0);
  await page.screenshot({
    path: `${process.env.SHOTS ?? test.info().outputDir}/last-hire-tooltip.png`,
  });
});
