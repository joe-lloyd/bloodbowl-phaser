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

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** The setup labels in viewport pixels, beside every visible HUD panel. */
async function setupLabelLayout(app: GameApp, page: Page) {
  await app.pitch.waitForCameraToSettle();
  const canvas = await app.pitch.canvas.boundingBox();
  const size = await app.pitch.canvasSize();
  if (!canvas) throw new Error("the game canvas has no layout box");
  const sx = canvas.width / size.width;
  const sy = canvas.height / size.height;
  const labels = (await app.bridge.setupLabels()).map((label) => ({
    text: label.text,
    x: canvas.x + label.x * sx,
    y: canvas.y + label.y * sy,
    width: label.width * sx,
    height: label.height * sy,
  }));
  const panels: Box[] = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".hud-slab, [data-testid=scoreboard], [data-testid=match-strip]"
      ),
    ]
      .filter((el) => getComputedStyle(el).opacity !== "0")
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map(({ x, y, width, height }) => ({ x, y, width, height }))
  );
  return { labels, panels };
}

async function expectReadableLabels(app: GameApp, page: Page) {
  const { labels, panels } = await setupLabelLayout(app, page);
  expect(labels.map((label) => label.text).sort()).toEqual([
    "Line of scrimmage 0/3",
    "No man's land, no setup",
    "Wide zone 0, max 1",
    "Wide zone 0, max 1",
  ]);
  for (const label of labels) {
    expect(label.height, label.text).toBeGreaterThanOrEqual(20);
    expect(label.x, label.text).toBeGreaterThanOrEqual(0);
    expect(label.x + label.width, label.text).toBeLessThanOrEqual(1280);
    for (const panel of panels)
      expect(overlaps(label, panel), `${label.text} under a panel`).toBe(false);
    for (const other of labels)
      if (other !== label)
        expect(overlaps(label, other), `${label.text} on a label`).toBe(false);
  }
}

test("setup labels are legible and clear of each other and the HUD for both halves at 1280x720", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "setup-coinflip", seed: 3 });
  await page.getByRole("button", { name: "FLIP COIN" }).click();
  await page.getByRole("button", { name: "KICK" }).click();
  await expect(page.getByTestId("setup-checklist")).toBeVisible({
    timeout: 15_000,
  });
  await expectReadableLabels(app, page);
  const select = page
    .locator("select")
    .filter({ has: page.locator("optgroup[label=Presets]") });
  const options = await select
    .locator("optgroup[label=Presets] option")
    .allTextContents();
  await select.selectOption(options[0]);
  await page.getByRole("button", { name: /LOAD/ }).click();
  await page.getByRole("button", { name: /CONFIRM SETUP/ }).click();
  await expect(page.getByTestId("setup-checklist")).toContainText(
    "Players placed 0/7",
    { timeout: 15_000 }
  );
  await expectReadableLabels(app, page);
});
