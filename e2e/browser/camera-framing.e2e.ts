import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

/**
 * Round 3, 1:06:00: framing a long reach zoomed out until players were
 * about 15 px tall. Round 3, 56:30: square 7,10 sat under the dice log's
 * A- button. The camera now stops pulling back while a 2 m figure is still
 * 28 px tall, and keeps the squares beside the player clear of every HUD
 * panel it measures on the page.
 */
const BESIDE = [
  { x: 7, y: 10 },
  { x: 6, y: 10 },
  { x: 8, y: 10 },
  { x: 6, y: 9 },
  { x: 8, y: 9 },
];

/** A 2 m figure against a square's width on screen, 99 world px. */
const FIGURE_PER_SQUARE = (2 * 25 * Math.cos(Math.PI / 6)) / (70 * Math.SQRT2);

async function expectClickable(page: Page, app: GameApp) {
  const canvas = await app.pitch.canvas.elementHandle();
  for (const square of BESIDE) {
    const point = await app.pitch.viewportPoint(square);
    const onCanvas = await page.evaluate(
      ([x, y, el]) => document.elementFromPoint(x, y) === el,
      [point.x, point.y, canvas] as const
    );
    expect(onCanvas, `square ${square.x},${square.y} is covered`).toBe(true);
  }
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("a long blitz reach keeps players readable and clear of the dice log", async ({
      page,
    }) => {
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "near-corner-blitz", seed: 1 });
      await app.pitch.clickPlayer("team1:0");
      await expect(app.hud.actionMenu()).toBeVisible();
      await app.hud.actionButton("blitz").click();
      await app.pitch.waitForCameraToSettle();

      // One square across the screen: one step along x, one back along y
      const a = await app.pitch.viewportPoint({ x: 7, y: 9 });
      const b = await app.pitch.viewportPoint({ x: 8, y: 8 });
      const figurePx = Math.hypot(b.x - a.x, b.y - a.y) * FIGURE_PER_SQUARE;
      expect(Math.round(figurePx)).toBeGreaterThanOrEqual(28);
      await expectClickable(page, app);

      await test.info().attach(`long-reach-${viewport.width}x${viewport.height}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    });
  });
}
