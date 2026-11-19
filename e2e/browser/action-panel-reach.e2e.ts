import { mkdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

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
    expect(
      onCanvas,
      `square ${String(square.x)},${String(square.y)} is covered`
    ).toBe(true);
  }
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${String(viewport.width)}x${String(viewport.height)}`, () => {
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
        path: `${dir}/action-panel-${String(viewport.width)}x${String(viewport.height)}.png`,
      });
    });
  });
}
