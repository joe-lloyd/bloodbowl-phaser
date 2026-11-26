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
  const box = fixtureValue(await tip.boundingBox());

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

test("the roster picker animates lineups and browses extra rosters", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/build-team/new-team");

  const card = page.getByTestId("roster-choice-Amazon");
  const art = card.locator("img");
  await expect(art).toHaveJSProperty("naturalWidth", 1760);
  await expect(art).toHaveCSS("animation-name", "none");
  await card.hover();
  await expect(art).toHaveCSS("animation-name", "roster-picker-idle");
  const frameOffsets = new Set<number>();
  await expect
    .poll(async () => {
      const offset = await art.evaluate((image) => {
        const transform = getComputedStyle(image).transform;
        return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
      });
      if (offset < 0) frameOffsets.add(offset);
      return frameOffsets.size;
    })
    .toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(art).toHaveCSS("animation-name", "none");

  await page.getByRole("tab", { name: "Additional rosters" }).click();
  await page.getByText("Slann", { exact: true }).click();
  await expect(page.getByText("Slann Catcher", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Secret team rosters" }).click();
  await expect(page.getByRole("status")).toHaveText("115 of 115 rosters");
  await page
    .getByRole("searchbox", { name: "Find a Secret League team" })
    .fill("Eonir");
  await expect(page.getByRole("status")).toHaveText("1 of 115 rosters");
  await page
    .locator("summary")
    .filter({ hasText: /^Eonir/ })
    .click();
  await expect(
    page.getByText("Give and Go", { exact: false }).first()
  ).toBeVisible();
  await page.getByRole("tab", { name: "Standard rosters" }).click();
  await card.click();
  await expect(
    page.getByRole("combobox", { name: "Roster", exact: true })
  ).toHaveValue("Amazon");
});

test("Witch Elves are built from the secret rosters", async ({ page }) => {
  await page.goto("/build-team/new-team");
  const card = page.getByTestId("roster-choice-Witch Elf");
  await expect(page.getByTestId("roster-choice-Wood Elf")).toBeVisible();
  await expect(card).toHaveCount(0);
  await page.getByRole("tab", { name: "Secret team rosters" }).click();
  await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 1760);
  await card.click();
  await expect(
    page.getByRole("combobox", { name: "Roster", exact: true })
  ).toHaveValue("Witch Elf");
});

test("a Secret League team is built from its stat file", async ({ page }) => {
  await page.goto("/build-team/new-team");
  await page.getByRole("tab", { name: "Secret team rosters" }).click();
  const card = page.getByTestId("roster-choice-Albion");
  await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 1760);
  await card.click();
  await expect(
    page.getByRole("combobox", { name: "Roster", exact: true })
  ).toHaveValue("Albion");
  const hires = page
    .locator(".hud-slab")
    .filter({ has: page.getByRole("heading", { name: "AVAILABLE HIRES" }) });
  await expect(
    hires.getByRole("row", { name: /Woad Berserker/ })
  ).toBeVisible();
});
