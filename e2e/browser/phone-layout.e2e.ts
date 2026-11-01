import { test, expect, Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";

/**
 * The match on a phone: thumb rails in landscape, a prompt to turn the
 * phone in portrait, and fingers in place of the mouse. An iPhone 14's
 * screen, 844 by 390 CSS px, with touch, so `(pointer: coarse)` matches.
 */
test.use({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
});

type Point = { x: number; y: number };

/** Raw touches, for the gestures Playwright has no helper for. */
async function touches(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, points: (Point & { id?: number })[]) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  return {
    async hold(at: Point, ms: number) {
      await send("touchStart", [at]);
      await page.waitForTimeout(ms);
      await send("touchEnd", []);
    },
    /** One finger along these points, a few moves between each. */
    async drag(path: Point[]) {
      await send("touchStart", [path[0]]);
      for (let i = 1; i < path.length; i++) {
        for (let k = 1; k <= 4; k++) {
          const a = path[i - 1];
          const b = path[i];
          await send("touchMove", [
            { x: a.x + ((b.x - a.x) * k) / 4, y: a.y + ((b.y - a.y) * k) / 4 },
          ]);
        }
      }
    },
    end: () => send("touchEnd", []),
    async spread(centre: Point, from: number, to: number) {
      const at = (half: number) => [
        { x: centre.x - half, y: centre.y, id: 1 },
        { x: centre.x + half, y: centre.y, id: 2 },
      ];
      await send("touchStart", at(from));
      for (let k = 1; k <= 8; k++)
        await send("touchMove", at(from + ((to - from) * k) / 8));
      await send("touchEnd", []);
    },
  };
}

async function openScenario(page: Page, scenario: string) {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario, seed: 1 });
  await app.pitch.waitForCameraToSettle();
  return app;
}

async function tapSquare(page: Page, app: GameApp, square: Point) {
  const at = await app.pitch.viewportPoint(square);
  await page.touchscreen.tap(at.x, at.y);
}

test("a phone held upright is asked to turn sideways", async ({ page }) => {
  await openScenario(page, "near-corner-blitz");
  await expect(page.getByTestId("rotate-prompt")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("rotate-prompt")).toBeVisible();
  await expect(page.getByTestId("rotate-prompt")).toHaveAccessibleName(
    "Turn your phone sideways"
  );
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId("rotate-prompt")).toBeHidden();
});

test("a tap selects and zooms to thumb-sized squares, a tap plans, Go walks", async ({
  page,
}) => {
  const app = await openScenario(page, "near-corner-blitz");
  const start = await app.pitch.squareOf("team1:0");
  await expect(page.getByTestId("move-hint")).toHaveText(
    "Your turn · tap a player"
  );

  await tapSquare(page, app, start);
  await expect(page.getByTestId("player-chip")).toBeVisible();
  await expect(page.getByTestId("action-move")).toBeVisible();
  await app.pitch.waitForCameraToSettle();
  const a = await app.pitch.viewportPoint(start);
  const b = await app.pitch.viewportPoint({ x: start.x + 1, y: start.y });
  // A diamond 84 by 42 px: one step along x is half of each
  expect(Math.round(Math.abs(b.x - a.x) * 2)).toBeGreaterThanOrEqual(84);
  expect(Math.round(Math.abs(b.y - a.y) * 2)).toBeGreaterThanOrEqual(42);

  const target = { x: start.x + 2, y: start.y };
  await tapSquare(page, app, target);
  await expect(page.getByTestId("move-plan")).toContainText("2 sq");
  // Nothing moves until Go
  expect(await app.pitch.squareOf("team1:0")).toEqual(start);
  await page.getByTestId("move-plan-go").tap();
  await expect
    .poll(() => app.pitch.squareOf("team1:0"), { timeout: 10_000 })
    .toEqual(target);
  await expect(page.getByTestId("move-plan")).toBeHidden();
});

test("a drag from the player draws a route under a magnifier", async ({
  page,
}) => {
  const app = await openScenario(page, "near-corner-blitz");
  const start = await app.pitch.squareOf("team1:0");
  await tapSquare(page, app, start);
  await app.pitch.waitForCameraToSettle();
  const route = [
    start,
    { x: start.x + 1, y: start.y },
    { x: start.x + 2, y: start.y },
    { x: start.x + 3, y: start.y - 1 },
  ];
  const points = [];
  for (const square of route)
    points.push(await app.pitch.viewportPoint(square));

  const finger = await touches(page);
  await finger.drag(points);
  await expect(page.getByTestId("route-loupe")).toBeVisible();
  await finger.end();
  await expect(page.getByTestId("route-loupe")).toBeHidden();
  await expect(page.getByTestId("move-plan")).toContainText("3 sq");

  // Back over the route cuts it
  await finger.drag([points[3], points[1]]);
  await finger.end();
  await expect(page.getByTestId("move-plan")).toContainText("1 sq");
  await page.getByTestId("move-plan-clear").tap();
  await expect(page.getByTestId("move-plan")).toBeHidden();
  await expect(page.getByTestId("move-hint")).toHaveText(
    "Tap a square or drag a route"
  );
});

test("press and hold shows the player card, a tap puts it away", async ({
  page,
}) => {
  const app = await openScenario(page, "near-corner-blitz");
  const square = await app.pitch.squareOf("team1:0");
  const finger = await touches(page);
  await finger.hold(await app.pitch.viewportPoint(square), 700);
  await expect(page.getByTestId("player-card")).toBeVisible();
  await expect(page.getByTestId("player-card")).toContainText("Skills");
  // The hold opened the card and did not select
  await expect(page.getByTestId("player-chip")).toBeHidden();
  await page.touchscreen.tap(420, 380);
  await expect(page.getByTestId("player-card")).toBeHidden();
});

test("two fingers zoom, and a double tap on open ground fits the pitch", async ({
  page,
}) => {
  await openScenario(page, "near-corner-blitz");
  const zoom = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            game: {
              scene: {
                getScene(k: string): { cameras: { main: { zoom: number } } };
              };
            };
          }
        ).game.scene.getScene("SandboxScene").cameras.main.zoom
    );
  const before = await zoom();
  const finger = await touches(page);
  await finger.spread({ x: 420, y: 200 }, 40, 140);
  expect(await zoom()).toBeGreaterThan(before * 2);

  await page.touchscreen.tap(420, 30 + 330);
  await page.touchscreen.tap(420, 30 + 330);
  await expect.poll(zoom).toBeCloseTo(before, 2);
});

test("End Turn ends the turn only after a hold", async ({ page }) => {
  const app = await openScenario(page, "near-corner-blitz");
  const first = (await app.bridge.snapshot()).activeTeamId;
  const button = page.getByTestId("end-turn");
  await button.tap();
  await expect(page.getByText("Hold to end the turn")).toBeVisible();
  expect((await app.bridge.snapshot()).activeTeamId).toBe(first);

  const box = (await button.boundingBox())!;
  const finger = await touches(page);
  await finger.hold(
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    900
  );
  await expect
    .poll(async () => (await app.bridge.snapshot()).activeTeamId)
    .not.toBe(first);
});

test("a pass aims on the first tap, shows its rolls, and throws on Throw", async ({
  page,
}) => {
  const app = await openScenario(page, "throw-marked-receiver");
  const thrower = await app.pitch.squareOf("team1:0");
  const receiver = await app.pitch.squareOf("team1:1");
  await tapSquare(page, app, thrower);
  await page.getByTestId("action-pass").tap();
  await page.getByTestId("action-step-pass").tap();
  await app.pitch.waitForCameraToSettle();

  await tapSquare(page, app, receiver);
  await expect(page.getByTestId("move-plan")).toContainText("Short Pass");
  await expect(page.getByTestId("move-plan")).toContainText("Catch");
  expect((await app.bridge.snapshot()).ballPosition).toEqual(thrower);

  await page.getByTestId("move-plan-go").tap();
  // The ball is in the air: the markers may try for it first
  await page.getByRole("button", { name: "Decline" }).tap();
  await expect
    .poll(async () => (await app.bridge.snapshot()).ballPosition, {
      timeout: 10_000,
    })
    .not.toEqual(thrower);
});

test("the coin toss, setup and kickoff all work by touch", async ({ page }) => {
  const app = new GameApp(page);
  await page.goto("/sand-box?scenario=setup-coinflip&seed=1");
  await app.pitch.waitForCanvas();
  await page.getByRole("button", { name: /flip coin/i }).tap();
  await page.getByRole("button", { name: "RECEIVE" }).tap();
  // The kicking side sets up first, then the receiving side
  for (const side of ["Setup Defense", "Setup Offense"]) {
    await expect(page.getByText(side)).toBeVisible();
    await page.getByRole("button", { name: "LOAD" }).tap();
    await page.getByRole("button", { name: /CONFIRM SETUP/ }).tap();
  }
  await expect(page.getByTestId("move-hint")).toHaveText(
    "Tap your kicker, then a square in their half"
  );
  const snapshot = await app.bridge.snapshot();
  const kickingTeam = snapshot.teams.find((team) =>
    team.players.some((p) => p.position && p.position.x < 10)
  )!;
  const kicker = kickingTeam.players.find((p) => p.position)!;
  await tapSquare(page, app, kicker.position!);
  await expect(page.getByTestId("phone-notice")).toContainText(
    "Kicker Selected"
  );
  await tapSquare(page, app, { x: 15, y: 5 });
  await expect
    .poll(async () => (await app.bridge.snapshot()).phase, { timeout: 20_000 })
    .toBe("PLAY");
});
