import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";

test("Bone Head asks before it rolls, and Cancel declares nothing", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "bone-head-activation" });
  const rolls = async () =>
    (await app.bridge.events()).filter(
      (e) => e.name === GameEventNames.DiceRoll
    );

  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  const confirm = app.hud.negatraitConfirm();
  await expect(confirm).toContainText("Bone Head: 2+");
  await expect(confirm).toContainText("Distracted");
  await page.screenshot({
    path: test.info().outputPath("negatrait-confirm.png"),
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toBeHidden();
  expect((await app.bridge.snapshot()).activePlayer).toBeNull();
  expect(await rolls()).toHaveLength(0);

  await app.pitch.clickSquare({ x: 12, y: 5 });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Roll", exact: true }).click();
  await app.bridge.expectEvent(GameEventNames.DiceRoll);
  expect((await app.bridge.snapshot()).activePlayer).not.toBeUndefined();
});
