import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import { GameApp } from "../support/pages/game";

test("Bone Head shows in the plan, rolls only on Go, and Clear declares nothing", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "bone-head-activation" });
  const rolls = async () => {
    const logged = await app.bridge.events();
    return logged.filter((e) => e.name === GameEventNames.DiceRoll);
  };

  await app.pitch.clickPlayer("team1:0");
  await app.hud.actionButton("move").click();
  const plan = app.hud.plannedActivationRoll();
  await expect(plan).toContainText("Bone Head 2+");
  await expect(plan).toContainText("Distracted");
  await expect(app.hud.negatraitConfirm()).toBeHidden();
  await page.screenshot({
    path: test.info().outputPath("negatrait-plan.png"),
  });
  await page.getByTestId("action-plan-clear").click();
  await expect(plan).toBeHidden();
  const snapshot = await app.bridge.snapshot();
  expect(snapshot.activePlayer).toBeNull();
  expect(await rolls()).toHaveLength(0);

  await app.pitch.clickSquare({ x: 12, y: 5 });
  await expect(plan).toContainText("Bone Head 2+");
  expect(await rolls()).toHaveLength(0);
  await page.getByTestId("action-plan-go").click();
  await expect
    .poll(async () => {
      const found = await rolls();
      return found.length;
    })
    .toBe(1);
  await expect(plan).toBeHidden();
});
