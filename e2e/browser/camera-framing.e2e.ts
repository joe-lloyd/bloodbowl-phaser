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
    test("a block frames the action between the score strip and dice tray, then returns to movement", async ({
      page,
    }) => {
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "chain-push", seed: 1 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await app.hud.declareAction("team1:0", "blitz");
      await app.hud.selectActionStep("block");
      await app.pitch.clickPlayer("team2:0");
      await app.hud.rollBlockDice();
      await expect(page.getByTestId("dice-tray")).toHaveAttribute(
        "data-dice",
        "landed"
      );
      await app.pitch.waitForCameraToSettle();
      const scoreboard = await page.getByTestId("scoreboard").evaluate((el) => {
        const box = el.parentElement!.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      const tray = await page.getByTestId("dice-tray").boundingBox();
      if (!tray) throw new Error("The dice tray has no box");
      const actor = await app.pitch.viewportPoint(
        await app.pitch.squareOf("team1:0")
      );
      const target = await app.pitch.viewportPoint(
        await app.pitch.squareOf("team2:0")
      );
      const usableCentre = (scoreboard.bottom + tray.y) / 2;
      const measurements = {
        viewport,
        scoreboard,
        tray,
        actor,
        target,
        usableCentre,
        canvas: await app.pitch.canvas.boundingBox(),
        canvasSize: await app.pitch.canvasSize(),
      };
      await test.info().attach("framing-measurements", {
        body: JSON.stringify(measurements, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({ path: test.info().outputPath("block-tray.png") });
      expect(Math.abs((actor.y + target.y) / 2 - usableCentre)).toBeLessThan(
        60
      );
      for (const point of [actor, target]) {
        expect(point.y).toBeGreaterThan(scoreboard.bottom + 28);
        expect(point.y).toBeLessThan(tray.y - 24);
        expect(
          await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
            point
          )
        ).toBe("CANVAS");
      }

      await app.hud.chooseBlockDie(0);
      await expect(page.getByTestId("push-choice-prompt")).toBeVisible();
      for (
        let step = 0;
        step < 4 && (await page.getByTestId("push-choice-prompt").isVisible());
        step++
      ) {
        const pending = await app.bridge.pendingDecision();
        if (pending?.type !== "push-direction")
          throw new Error("No push square offered");
        await app.pitch.clickSquare(pending.options[0]);
      }
      await app.hud.answerFollowUp(false);
      await app.hud.selectActionStep("move");
      await expect(page.getByTestId("dice-tray")).toHaveAttribute(
        "data-dice",
        "empty"
      );
      const beforeMove = await app.pitch.viewportPoint({ x: 9, y: 5 });
      await page.screenshot({
        path: test.info().outputPath("return-to-movement.png"),
      });
      await app.pitch.clickSquare({ x: 9, y: 4 });
      await app.pitch.clickSquare({ x: 9, y: 4 });
      await expect
        .poll(() => app.pitch.squareOf("team1:0"))
        .toEqual({ x: 9, y: 4 });
      const afterMove = await app.pitch.viewportPoint({ x: 9, y: 5 });
      await test.info().attach("movement-measurements", {
        body: JSON.stringify({ beforeMove, afterMove }),
        contentType: "application/json",
      });
      expect(
        Math.hypot(afterMove.x - beforeMove.x, afterMove.y - beforeMove.y)
      ).toBeLessThan(2);
      await page.screenshot({
        path: test.info().outputPath("movement-continued.png"),
      });
    });

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

      await test
        .info()
        .attach(`long-reach-${viewport.width}x${viewport.height}`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
    });
  });
}
