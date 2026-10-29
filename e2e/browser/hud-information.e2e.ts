/**
 * What the HUD tells the coach, checked in the real game: the player card
 * during a move, and no stray card from a press on a HUD button.
 */

import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test("a press on a HUD button never shows the card of the player under it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "setup-coinflip", seed: 3 });
  await page.getByRole("button", { name: "FLIP COIN" }).click();
  // At 1280x720 this button sits over the bottom dugout's players.
  await page
    .getByRole("button", { name: /^(KICK|RECEIVE)$/ })
    .first()
    .click();
  await expect(page.getByTestId("setup-checklist")).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(500);
  await expect(page.getByText("COMPARING")).toHaveCount(0);
  await expect(page.getByText(/ Lineman #\d+$/)).toHaveCount(0);
});

test("the player card counts movement and rushes left after a partial move", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "movement-test", seed: 7 });
  const runner = (await app.bridge.snapshot()).teams[0].players[0];
  const ma = runner.stats.MA;
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickPath([
    { x: 2, y: 4 },
    { x: 2, y: 3 },
  ]);
  await app.pitch.clickSquare({ x: 2, y: 3 });
  await expect
    .poll(
      async () => (await app.bridge.snapshot()).teams[0].players[0].position
    )
    .toEqual({ x: 2, y: 3 });
  await expect(page.getByTestId("movement-left")).toHaveText(
    `MA ${ma}, ${ma - 2} left, 2 rush`
  );
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  test(`the full time results card is centred at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "full-time" });
    const card = page.getByTestId("match-results");
    await expect(card).toContainText("Full Time");
    await expect(card).toContainText("Draw");
    // Wait out the pop-in animation before measuring.
    await page.waitForTimeout(400);
    const box = await card.boundingBox();
    if (!box) throw new Error("the results card has no layout box");
    const left = box.x;
    const right = viewport.width - (box.x + box.width);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  });
}
