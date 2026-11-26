import { test, expect, type Page } from "@playwright/test";
import { KICKOFF_EXAMPLE_SEEDS } from "../../src/data/kickoffScenarios";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GameApp } from "../support/pages/game";

test.use({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  contextOptions: { reducedMotion: "no-preference" },
});

interface BallCamera {
  following: boolean;
  x: number;
  y: number;
}

async function ballCamera(page: Page): Promise<BallCamera> {
  return page.evaluate(() => {
    const scene = globalThis.game?.scene.getScene("SandboxScene");
    if (!scene || !("ballSprite" in scene)) throw new Error("no match scene");
    const camera = scene.cameras.main;
    const ball = scene.ballSprite;
    const { x, y } = camera.worldView;
    const at =
      typeof ball === "object" && ball !== null && "x" in ball && "y" in ball
        ? { x: Number(ball.x), y: Number(ball.y) }
        : { x: 0, y: 0 };
    return {
      following: Reflect.get(camera, "_follow") === ball && ball !== null,
      x: (at.x - x) * camera.zoom,
      y: (at.y - y) * camera.zoom,
    };
  });
}

test("the camera stays on a kicked ball while the HUD changes and the phone turns", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const app = new GameApp(page);
  await app.sandbox.open({
    scenario: "kickoff-table-standard",
    seed: KICKOFF_EXAMPLE_SEEDS[KickoffEvent.DODGY_SNACK],
    outcome: "dodgy-snack",
  });
  await app.pitch.waitForCameraToSettle();
  for (const square of [await app.pitch.squareOf("team1:0"), { x: 17, y: 2 }]) {
    const at = await app.pitch.viewportPoint(square);
    await page.touchscreen.tap(at.x, at.y);
  }
  await expect.poll(async () => {
    const camera = await ballCamera(page);
    return camera.following;
  }).toBe(true);

  const viewports = [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ];
  for (const size of viewports) {
    await page.setViewportSize(size);
    await expect.poll(() => app.pitch.canvasSize()).toEqual(size);
    await page.waitForTimeout(700);
    const ball = await ballCamera(page);
    expect(ball.following, `lost at ${String(size.width)}`).toBe(true);
    expect(Math.abs(ball.x - size.width / 2)).toBeLessThan(size.width * 0.3);
    expect(Math.abs(ball.y - size.height / 2)).toBeLessThan(size.height * 0.4);
  }
  await expect(
    page.getByRole("button", { name: "ROLL KICK-OFF" })
  ).toBeVisible({ timeout: 30_000 });
  const finalBall = await ballCamera(page);
  expect(finalBall.following).toBe(true);
});
