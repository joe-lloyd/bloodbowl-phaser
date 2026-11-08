import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";

/**
 * A coach on a trackpad keeps one hand on the keys: WASD or the arrows
 * slide the camera, and the keys on the buttons' badges play the turn.
 */
test("WASD and the arrow keys slide the camera while held", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-foul-preview" });
  await app.pitch.waitForCameraToSettle();
  const square = { x: 10, y: 5 };
  const start = await app.pitch.viewportPoint(square);

  // The view moves right, so the pitch slides left
  await page.keyboard.down("d");
  await page.waitForTimeout(400);
  await page.keyboard.up("d");
  const right = await app.pitch.viewportPoint(square);
  expect(right.x).toBeLessThan(start.x - 50);

  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowUp");
  const up = await app.pitch.viewportPoint(square);
  expect(up.y).toBeGreaterThan(right.y + 50);
  expect(Math.abs(up.x - right.x)).toBeLessThan(2);
});

test("a foul is declared and confirmed from the keyboard", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-foul-preview" });
  await app.pitch.clickPlayer("team1:0");
  await expect(app.hud.actionMenu()).toBeVisible();
  await expect(app.hud.actionButton("foul").locator("kbd")).toHaveText("F");
  await page.screenshot({ path: test.info().outputPath("action-keys.png") });

  await page.keyboard.press("f");
  await expect(page.getByTestId("action-step-foul")).toBeVisible();
  await app.pitch.clickPlayer("team2:0");
  await expect(page.getByTestId("confirmation-modal")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("confirmation-modal")).toBeHidden();
  await app.bridge.expectEvent(GameEventNames.DiceRoll);
});

test("the menu's keys wait while a decision is open, and Enter presses the focused button", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "ux-foul-preview" });
  await app.hud.declareAction("team1:0", "foul");
  await app.pitch.clickPlayer("team2:0");
  const confirm = page.getByTestId("confirmation-modal");
  await expect(confirm).toBeVisible();

  // The dialog hides End Activation and End Turn, so their keys do nothing
  await page.keyboard.press("e");
  await page.keyboard.press("Shift+E");
  await expect(confirm).toBeVisible();
  expect((await app.bridge.phase()).activeTeamId).toBe(
    await app.bridge.resolveRef("team1")
  );

  // Tabbed to Cancel, Enter cancels instead of fouling
  await confirm.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(confirm).toBeHidden();
  expect(
    (await app.bridge.events()).filter(
      (e) => e.name === GameEventNames.DiceRoll
    )
  ).toHaveLength(0);
  await expect(app.hud.actionMenu()).toBeVisible();
});
