import { expect, test } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
import {
  sampleCamera,
  finishCameraSample,
  expectZoomHeld,
} from "../support/camera";
import { GameApp } from "../support/pages/game";

test.use({ viewport: { width: 1280, height: 720 } });

test.use({ contextOptions: { reducedMotion: "no-preference" } });

test("Frenzy rolls its second block automatically and the blitzer can dodge away afterward", async ({
  page,
}) => {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "frenzy-second-block", seed: 11 });
  await app.pitch.waitForCameraToSettle();
  await sampleCamera(page);
  await app.hud.declareAction("team1:0", "blitz");
  await app.pitch.clickSquare({ x: 10, y: 4 });
  await app.pitch.clickSquare({ x: 10, y: 4 });
  await page.getByRole("button", { name: "Dodge!", exact: true }).click();
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 10, y: 4 });
  await app.bridge.expectEvent(GameEventNames.PlayerMovedInAction);
  await expect(page.getByTestId("dice-tray")).toHaveAttribute(
    "data-dice",
    "empty"
  );

  await app.hud.selectActionStep("block");
  await app.pitch.clickPlayer("team2:0");
  await app.hud.rollBlockDice();
  await app.hud.chooseBlockResult("push");
  await expect(page.getByTestId("push-choice-prompt")).toBeVisible();
  await expect(page.getByTestId("dice-tray")).toHaveAttribute(
    "data-dice",
    "empty"
  );
  await app.pitch.clickSquare({ x: 12, y: 5 });

  await expect(page.getByTestId("block-die-0")).toBeVisible();
  await expect(page.getByTestId("block-roll-dice")).toBeHidden();
  await expect(app.hud.followUpDialog()).toBeHidden();
  expect(await app.pitch.squareOf("team1:0")).toEqual({ x: 11, y: 5 });
  await page.screenshot({
    path: test.info().outputPath("frenzy-second-roll.png"),
  });

  await app.hud.chooseBlockResult("push");
  await expect(page.getByTestId("push-choice-prompt")).toBeVisible();
  await expect(page.getByTestId("dice-tray")).toHaveAttribute(
    "data-dice",
    "empty"
  );
  await app.pitch.clickSquare({ x: 13, y: 5 });
  await app.bridge.expectEvent(GameEventNames.UI_ResumeBlitzMove);
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 12, y: 5 });
  await expect(app.hud.followUpDialog()).toBeHidden();

  await app.pitch.clickSquare({ x: 11, y: 4 });
  await app.pitch.clickSquare({ x: 11, y: 4 });
  await page.getByRole("button", { name: "Dodge!", exact: true }).click();
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 11, y: 4 });
  await page.screenshot({
    path: test.info().outputPath("frenzy-blitz-continued.png"),
  });
  expectZoomHeld(
    await finishCameraSample(page, test.info(), "frenzy-blitz-zoom")
  );
});
