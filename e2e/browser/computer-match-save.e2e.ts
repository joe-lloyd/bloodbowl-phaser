/**
 * Coming back to a match against the computer, through the real pages: the
 * toss starts the save, the options menu is usable, the menu banner and a
 * reload both pick the match up, and abandoning it removes the save.
 */
import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

const SAVE_KEY = "bloodbowl_local_match_save";

async function startComputerMatch(page: Page, app: GameApp) {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/build-team");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Seed All Rosters/ }).click();
  await page.goto("/select-team");
  await page
    .getByRole("button", { name: /Human Founders/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Orc Founders/ })
    .last()
    .click();
  await page.getByRole("radio", { name: /Versus computer/ }).click();
  await page.getByRole("button", { name: /Start Game/ }).click();
  await app.bridge.waitForReady();
  const flip = page.getByRole("button", { name: "FLIP COIN" });
  await flip.waitFor({ timeout: 120_000 });
  await flip.click();
}

/** The toss is won or lost at random; a toss the human wins needs a choice. */
async function waitForSave(page: Page) {
  const receive = page.getByRole("button", { name: /^RECEIVE$/ });
  await expect(async () => {
    if (await receive.count()) await receive.first().click({ timeout: 500 });
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key) !== null,
      SAVE_KEY
    );
    expect(saved).toBe(true);
  }).toPass({ timeout: 60_000 });
}

/** The real click target at the row's centre: clipped rows hit something else. */
async function isOnTop(page: Page, name: RegExp) {
  const item = page.getByRole("menuitem", { name });
  const box = (await item.boundingBox())!;
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

  // A reload picks the match up instead of tossing the coin again.
  await page.reload();
  const options = page.getByRole("button", { name: /match options/i });
  await options.waitFor({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "FLIP COIN" })).toHaveCount(0);

  // The banner names the match and takes the coach back to it.
  await page.goto("/");
  const banner = page.getByTestId("resume-local-match");
  await expect(banner).toContainText("Resume match against the computer");
  await banner.click();
  await expect(page).toHaveURL(/\/play\/computer$/);
  await options.waitFor({ timeout: 120_000 });
  await expect(page.getByRole("button", { name: "FLIP COIN" })).toHaveCount(0);

  await options.click();
  await expect(page.getByRole("menu")).toBeVisible();
  // The entrance animation moves the rows; check them once they are at rest.
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
