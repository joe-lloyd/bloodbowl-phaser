import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmPregame } from "../support/pregame";

import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const SAVE_KEY = "bloodbowl_local_match_save";

async function startComputerMatch(page: Page, app: GameApp) {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/build-team");
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await page.getByText("Development fixtures", { exact: true }).click();
  await page.getByRole("button", { name: /Seed All Rosters/ }).click();
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page.getByRole("radio", { name: /Versus computer/ }).click();
  await page.getByRole("button", { name: /Green Bay Smackers/ }).click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();
  await app.rollWeather(120_000);
  await confirmPregame(page);
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await flip.waitFor({ timeout: 15_000 });
  await flip.click();
}

async function waitForSave(page: Page) {
  const receive = page.getByRole("button", { name: /^RECEIVE$/ });
  await expect(async () => {
    if (await receive.count()) await receive.first().click({ timeout: 500 });

    const subPhase = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw
        ? (JSON.parse(raw) as { snapshot?: { subPhase?: string } }).snapshot
            ?.subPhase
        : null;
    }, SAVE_KEY);
    expect(subPhase).toMatch(/^SETUP_/);
  }).toPass({ timeout: 60_000 });
}

async function isOnTop(page: Page, name: RegExp) {
  const item = page.getByRole("menuitem", { name });
  const box = fixtureValue((await item.boundingBox()));
  return item.evaluate(
    (element, point) =>
      element.contains(document.elementFromPoint(point.x, point.y)),
    { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  );
}

test("saves after the toss, resumes, and abandons from the options menu", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await startComputerMatch(page, app);
  await waitForSave(page);

  await page.reload();
  const options = page.getByRole("button", { name: /match options/i });
  await options.waitFor({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "FLIP COIN" })).toHaveCount(0);

  await page.goto("/");
  const banner = page.getByTestId("resume-local-match");
  await expect(banner).toContainText("Resume match against the computer");
  await banner.click();
  await expect(page).toHaveURL(/\/play\/computer$/);
  await options.waitFor({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "FLIP COIN" })).toHaveCount(0);

  await options.click();
  await expect(page.getByRole("menu")).toBeVisible();

  await expect.poll(() => isOnTop(page, /return to main menu/i)).toBe(true);
  expect(await isOnTop(page, /abandon match/i)).toBe(true);

  await page.getByRole("menuitem", { name: /abandon match/i }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /abandon match/i })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("resume-local-match")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)
  ).toBeNull();
});
