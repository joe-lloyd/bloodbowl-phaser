/**
 * Charge! at the kick-off, through to the receiving team's first turn.
 *
 * Live site: the coach picked one charger and confirmed. The Charge
 * selected that same player again, the action menu took it as a repeat
 * and stayed shut, and nobody could act.
 */
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";

test("a lone charger gets the action menu, then the receiving team plays", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "kickoff-table-standard",
    seed: 2,
    outcome: "charge",
  });
  await app.pitch.waitForCameraToSettle();
  await app.pitch.clickPlayer("team1:0");
  await app.pitch.clickSquare({ x: 14, y: 5 });
  const confirm = page.getByRole("button", { name: /confirm/i });
  await expect(confirm).toBeVisible({ timeout: 30_000 });

  // One charger, confirmed: the menu opens for them
  await app.pitch.clickPlayer("team1:2");
  await confirm.click();
  await expect(app.hud.actionMenu()).toBeVisible({ timeout: 10_000 });
  await app.hud.actionButton("move").click();
  const from = await app.pitch.squareOf("team1:2");
  const to = { x: from.x + 1, y: from.y };
  await app.pitch.clickSquare(to);
  await app.pitch.clickSquare(to);
  await expect.poll(() => app.pitch.squareOf("team1:2")).toEqual(to);
  await page.getByRole("button", { name: /end activation/i }).click();

  // The drive begins on the receiving team's turn, and they can act
  await expect
    .poll(async () => (await app.bridge.phase()).phase, { timeout: 20_000 })
    .toBe("PLAY");
  await app.pitch.clickPlayer("team2:3");
  await expect(app.hud.actionButton("move")).toBeVisible({ timeout: 10_000 });
  await page.screenshot({
    path: `${process.env.SHOTS ?? test.info().outputDir}/charge-then-receiving-turn.png`,
  });
});
