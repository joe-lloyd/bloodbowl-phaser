import { Page, test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import type { BrowserTestBridge } from "../../src/testing/browserBridge";

/** The score bug, turn tab and match strip as one box on screen. */
async function hudTop(page: Page) {
  const boxes = await Promise.all(
    ["scoreboard", "match-strip"].map((id) =>
      page.getByTestId(id).boundingBox()
    )
  );
  if (boxes.some((box) => !box)) throw new Error("Score bug has no bounds");
  const [bug, strip] = boxes as NonNullable<(typeof boxes)[number]>[];
  return {
    left: bug.x,
    right: bug.x + bug.width,
    bottom: Math.max(bug.y + bug.height, strip.y + strip.height),
  };
}

/**
 * Points on the far touchline and far end line, the highest edges of the
 * pitch on screen, that are on screen but under the score bug.
 */
async function squaresUnderHud(app: GameApp, page: Page) {
  const hud = await hudTop(page);
  await app.pitch.waitForCameraToSettle();
  const box = await app.pitch.canvas.boundingBox();
  const size = await app.pitch.canvasSize();
  if (!box) throw new Error("the game canvas has no layout box");
  // Square centres sit half a square in from their top corner.
  const corners = await page.evaluate(() => {
    const bridge = (window as unknown as Record<string, BrowserTestBridge>)
      .__bbTestBridge;
    const edge = [
      ...Array.from({ length: 21 }, (_, x) => ({ x, y: 0 })),
      ...Array.from({ length: 11 }, (_, y) => ({ x: 0, y: y + 1 })),
    ];
    return edge.map((point) => ({
      point,
      design: bridge.squareToCanvas(point.x - 0.5, point.y - 0.5),
    }));
  });
  const covered: string[] = [];
  for (const { point, design } of corners) {
    if (!design) throw new Error("no pitch is rendered yet");
    const corner = {
      x: box.x + design.x * (box.width / size.width),
      y: box.y + design.y * (box.height / size.height),
    };
    if (
      corner.y >= 0 &&
      corner.y < hud.bottom &&
      corner.x > hud.left &&
      corner.x < hud.right
    )
      covered.push(`${point.x},${point.y}`);
  }
  return covered;
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`match strip stays slim and clear of the pitch at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: "movement-test", seed: 7 });
    const strip = page.getByTestId("match-strip");
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("match-weather")).toHaveText("☀Nice");
    await expect(page.getByTestId("match-weather")).toHaveAttribute(
      "title",
      "Nice: No effect on play"
    );
    await expect(page.getByTestId("turns-left")).toHaveText("Turn 2 of 6");
    // The turn shows once, in the tab, not again beside it
    expect((await strip.innerText()).match(/turn/gi)).toEqual(["TURN"]);
    // The strip has the score bug's backing, so the pitch never shows through
    const backing = await page
      .getByTestId("match-strip-bar")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(backing).toBe("rgba(21, 23, 28, 0.94)");
    const box = await strip.boundingBox();
    const bug = await page.getByTestId("scoreboard").boundingBox();
    if (!box || !bug) throw new Error("Match strip has no bounds");
    expect(box.width).toBeLessThanOrEqual(bug.width);
    expect(box.height).toBeLessThanOrEqual(40);
    const pitch = await app.pitch.pitchViewportRect();
    expect(box.y + box.height).toBeLessThanOrEqual(pitch.y);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight
      )
    ).toBe(true);
  });
}

test("the action framing keeps playing squares out from under the score bug at 1280x720", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "score-run-dodge-rush", seed: 2 });
  expect(await squaresUnderHud(app, page)).toEqual([]);
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.waitForCameraToSettle();
  expect(await squaresUnderHud(app, page)).toEqual([]);
});
