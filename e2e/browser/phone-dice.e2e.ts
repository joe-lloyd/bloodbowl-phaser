import { test, expect, type Page } from "@playwright/test";
import { fixtureValue } from "../../src/testing/fixtureValue";
import {
  cameraState,
  finishCameraSample,
  sampleCamera,
} from "../support/camera";
import { GameApp } from "../support/pages/game";

test.use({
  hasTouch: true,
  isMobile: true,
  contextOptions: { reducedMotion: "no-preference" },
});

const SQUARE_PX = 70 * Math.SQRT1_2;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

async function openBlock(page: Page): Promise<GameApp> {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "block-injury-casualty", seed: 102 });
  await app.pitch.waitForCameraToSettle();
  for (const ref of ["team2:0", "team1:3"]) {
    const at = await app.pitch.viewportPoint(await app.pitch.squareOf(ref));
    await page.touchscreen.tap(at.x, at.y);
    if (ref === "team2:0") await page.getByTestId("action-block").tap();
    await app.pitch.waitForCameraToSettle();
  }
  await expect(page.getByTestId("block-dice-dialog")).toBeVisible();
  return app;
}

async function expectPinnedClear(page: Page): Promise<Box> {
  const dice = fixtureValue(await page.getByTestId("dice-tray").boundingBox());
  for (const id of ["decision-dock", "dice-log-toggle"]) {
    const other = await page.getByTestId(id).boundingBox();
    expect(other && overlaps(dice, other), `dice cover ${id}`).toBeFalsy();
  }
  return dice;
}

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 640, height: 360 },
  { width: 844, height: 390 },
]) {
  test.describe(`${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ viewport });

    test("dice roll in a pinned box clear of the block prompt, and the zoom holds", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const app = await openBlock(page);
      const before = (await cameraState(page)).zoom;
      expect(before * SQUARE_PX).toBeGreaterThanOrEqual(19.9);
      await sampleCamera(page);
      await page.getByTestId("block-roll-dice").tap();
      const tray = page.getByTestId("dice-tray");
      await expect(tray).toHaveAttribute("data-dice", "landed", {
        timeout: 20_000,
      });
      await expect(page.getByTestId("block-die-0")).toBeVisible();
      const pinned = await expectPinnedClear(page);
      expect(
        await tray
          .locator("canvas")
          .evaluate((canvas) => getComputedStyle(canvas).pointerEvents)
      ).toBe("none");
      await expect(tray).toHaveClass(/hud-slab/);

      await page.locator('[data-block-result="pow"]').first().tap();
      await expect(page.getByTestId("push-choice-prompt")).toBeVisible();
      const pending = await app.bridge.pendingDecision();
      if (pending?.type !== "push-direction") throw new Error("no push choice");
      const at = await app.pitch.viewportPoint(fixtureValue(pending.options[0]));
      await page.touchscreen.tap(at.x, at.y);
      await expect(tray.getByTestId("roll-banner")).toContainText("Armour", {
        timeout: 20_000,
      });
      const { x, y, width } = fixtureValue(await tray.boundingBox());
      expect({ x, y, width }).toEqual({
        x: pinned.x,
        y: pinned.y,
        width: pinned.width,
      });
      await expect(tray.getByTestId("roll-banner")).toContainText("Injury", {
        timeout: 20_000,
      });
      const samples = await finishCameraSample(
        page,
        test.info(),
        "zoom-through-rolls"
      );
      const zooms = samples.map((sample) => sample.zoom);
      expect(Math.min(...zooms)).toBe(before);
      expect(Math.max(...zooms)).toBe(before);
    });
  });
}
