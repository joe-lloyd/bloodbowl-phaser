import { mkdir } from "node:fs/promises";
import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

/**
 * Round 2, 39:21: with the action panel open, a blitzer near the far end
 * could not reach squares 18,0 to 19,1, as the panel covered them. The
 * camera frames the player's reach clear of the HUD columns, so every
 * square in that corner takes the click.
 */
const CORNER = [
  { x: 18, y: 0 },
  { x: 19, y: 0 },
  { x: 18, y: 1 },
  { x: 19, y: 1 },
];

async function expectCornerClickable(page: Page, app: GameApp) {
  const canvas = await app.pitch.canvas.elementHandle();
  for (const square of CORNER) {
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
    test("the action panel leaves the far corner clickable", async ({
      page,
    }) => {
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "far-end-blitz", seed: 1 });
      await app.pitch.clickPlayer("team1:0");
      await expect(app.hud.actionMenu()).toBeVisible();
      await expectCornerClickable(page, app);

      await app.hud.actionButton("blitz").click();
      await expect(app.hud.actionMenu()).toBeVisible();
      await expectCornerClickable(page, app);

      const dir = "/tmp/review-loop-round2";
      await mkdir(dir, { recursive: true });
      await page.screenshot({
        path: `${dir}/action-panel-${viewport.width}x${viewport.height}.png`,
      });
    });
  });
}
