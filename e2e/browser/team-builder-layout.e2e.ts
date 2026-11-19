import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";

test("the available hires list has no inner vertical scroll at 1440x900", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  await page.getByTestId("roster-choice-Vampire").click();
  const hires = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "AVAILABLE HIRES" }) });
  await expect(hires.getByRole("row")).toHaveCount(6);

  const scrollBoxes = await hires.evaluate((panel) =>
    [panel, ...panel.querySelectorAll<HTMLElement>("*")]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
      .map(
        (el) =>
          `${String(el.className)}: ${String(el.scrollHeight)} > ${String(el.clientHeight)}`
      )
  );
  expect(scrollBoxes).toEqual([]);
});

test("a skill tooltip on the last hire opens whole, outside the table", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  await page.getByTestId("roster-choice-Vampire").click();
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
    `[id="${String(await trigger.getAttribute("aria-describedby"))}"]`
  );
  await expect(tip).toBeVisible();
  const box = fixtureValue((await tip.boundingBox()));

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
    path: `${process.env["SHOTS"] ?? test.info().outputDir}/last-hire-tooltip.png`,
  });
});

test("a new team chooses its roster first, then the main choices lead the sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-team/new-team");
  await expect(
    page.getByRole("heading", { name: "CHOOSE YOUR TEAM" })
  ).toBeVisible();
  await expect(page.getByPlaceholder("Enter Team Name")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("roster-picker.png") });

  await page.getByTestId("roster-choice-Human").click();
  const main = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "MAIN CHOICES" }) });
  await expect(
    main.getByRole("combobox", { name: "Roster", exact: true })
  ).toHaveValue("Human");
  await expect(
    main.getByRole("combobox", { name: "Sevens rules" })
  ).toBeVisible();
  await expect(
    main.getByRole("group", { name: "Advancement Mode" })
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("main-choices.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/build-team/new-team");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: test.info().outputPath("roster-picker-phone.png"),
  });
});
