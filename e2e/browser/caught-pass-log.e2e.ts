import { test, expect } from "@playwright/test";
import {
  sampleCamera,
  finishCameraSample,
  expectZoomHeld,
} from "../support/camera";
import { GameApp } from "../support/pages/game";

test.use({ contextOptions: { reducedMotion: "no-preference" } });

test("a caught pass logs the pass roll and then the catch roll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "pass-success-seeded", seed: 776 });
  await app.pitch.waitForCameraToSettle();
  await sampleCamera(page);
  await app.hud.declareAction("team1:0", "pass");
  await app.hud.selectActionStep("pass");
  await app.pitch.clickSquare(await app.pitch.squareOf("team1:1"));

  const log = page.getByTestId("dice-log");
  await expect(log.getByText(/^Catch \(.+\): \d, needs \d\+$/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(log.getByText(/^Pass \(.+\): \d, needs \d\+$/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("caught-pass.png") });
  expectZoomHeld(await finishCameraSample(page, test.info(), "pass-zoom"));
});
