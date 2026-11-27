import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, type Page } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameEventNames } from "../../src/types/events";
import {
  cameraState,
  sampleCamera,
  finishCameraSample,
  expectZoomHeld,
} from "../support/camera";

test.use({ contextOptions: { reducedMotion: "no-preference" } });

async function openSpread(page: Page) {
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "camera-spread-team", seed: 1 });
  await app.pitch.waitForCameraToSettle();
  return app;
}

async function expectTeamFits(
  page: Page,
  app: GameApp,
  teamIndex: number,
  eligibleOnly = false,
  centred = true
) {
  await app.pitch.waitForCameraToSettle();
  const state = await app.bridge.snapshot();
  const team = state.teams[teamIndex];
  const players = fixtureValue(team).players.filter(
    (p) =>
      p.position &&
      (!eligibleOnly || !state.turn.activatedPlayerIds.includes(p.id))
  );
  const { geometry, z, points } = await page.evaluate(
    (squares) => {
      const canvas = (document
        .querySelector("#game-container canvas"))!
        .getBoundingClientRect();
      const top = (document
        .querySelector('[data-hud-frame="top"]'))!
        .getBoundingClientRect().bottom;
      const tray = (document.querySelector('[data-hud-frame="bottom"]'))!;
      const trayTop =
        tray.getAttribute("aria-hidden") === "true"
          ? canvas.bottom
          : tray.getBoundingClientRect().top;

      const hint = document.querySelector('[data-testid="move-hint"]');
      const bottom = Math.min(
        trayTop,
        hint?.getBoundingClientRect().top ?? canvas.bottom
      );
      const bridge = (
        globalThis as unknown as {
          __bbTestBridge: import("../../src/testing/browserBridge").BrowserTestBridge;
        }
      ).__bbTestBridge;
      const size = bridge.canvasSize();
      return {
        geometry: { top, bottom, left: canvas.left, right: canvas.right },
        z: ((bridge.cameraState())!.zoom * canvas.height) / size.height,
        points: squares.map((s) => {
          const p = (bridge.squareToCanvas(s.x, s.y))!;
          return {
            x: canvas.left + (p.x * canvas.width) / size.width,
            y: canvas.top + (p.y * canvas.height) / size.height,
          };
        }),
      };
    },
    players.map((p) => (p.position)!)
  );
  for (const p of points) {
    expect(p.x - 50 * z).toBeGreaterThanOrEqual(geometry.left + 23);
    expect(p.x + 50 * z).toBeLessThanOrEqual(geometry.right - 23);
    expect(p.y - 70 * z).toBeGreaterThanOrEqual(geometry.top + 23);
    expect(p.y + 25 * z).toBeLessThanOrEqual(geometry.bottom - 23);
  }
  const middle =
    (Math.min(...points.map((p) => p.y)) -
      70 * z +
      Math.max(...points.map((p) => p.y)) +
      25 * z) /
    2;
  if (centred)
    expect(
      Math.abs(middle - (geometry.top + geometry.bottom) / 2)
    ).toBeLessThan(3);
}

test("direct teammate selection after movement holds zoom for every frame and selects the requested player", async ({
  page,
}) => {
  const app = await openSpread(page);
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 8, y: 6 });
  await app.pitch.clickSquare({ x: 8, y: 6 });
  await expect
    .poll(() => app.pitch.squareOf("team1:0"))
    .toEqual({ x: 8, y: 6 });
  await app.pitch.waitForCameraToSettle();
  const requestedId = await app.bridge.resolveRef("team1:1");
  await sampleCamera(page);
  await app.pitch.clickPlayer("team1:1");
  await app.pitch.waitForCameraToSettle();
  await page.waitForTimeout(1500);
  const logged = await app.bridge.events();
  const selected = logged.findLast((e) => e.name === GameEventNames.PlayerSelected);
  expect(selected?.data).toMatchObject({ player: { id: requestedId } });
  const snapshot = await app.bridge.snapshot();
  expect(snapshot.turn.activatedPlayerIds).toContain(
    await app.bridge.resolveRef("team1:0")
  );
  expectZoomHeld(
    await finishCameraSample(page, test.info(), "direct-selection-frames")
  );
  const events = await app.bridge.events();
  expect(
    events.filter((e) => e.name === GameEventNames.Camera_ChooseNextPlayer)
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("direct-selection.png"),
  });
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`${String(viewport.width)}x${String(viewport.height)}`, () => {
    test.use({ viewport });
    test("explicit End activation fits every eligible teammate in the measured gap", async ({
      page,
    }) => {
      const app = await openSpread(page);
      await app.hud.declareAction("team1:0", "move");
      await page.getByTestId("action-end-activation").click();
      await expectTeamFits(page, app, 0, true);
      await page.screenshot({
        path: test.info().outputPath("eligible-team-fit.png"),
      });
    });
    test("selection and action declaration pan clear of the HUD at a fixed zoom", async ({
      page,
    }) => {
      const app = new GameApp(page);
      await app.sandbox.open({ scenario: "near-corner-blitz", seed: 1 });
      await app.pitch.waitForCameraToSettle();
      await sampleCamera(page);
      await app.hud.declareAction("team1:0", "blitz");
      await app.pitch.waitForCameraToSettle();
      const at = await app.pitch.viewportPoint({ x: 7, y: 9 });
      expect(
        await page.evaluate(
          ([x, y]) => document.elementFromPoint((x)!, (y)!)?.tagName,
          [at.x, at.y]
        )
      ).toBe("CANVAS");
      expectZoomHeld(
        await finishCameraSample(page, test.info(), "selection-zoom")
      );
      await page.screenshot({ path: test.info().outputPath("tracking.png") });
    });
  });
}

test("the wheel can zoom out after a wide team fit", async ({ page }) => {
  const app = await openSpread(page);
  await app.hud.declareAction("team1:0", "move");
  await page.getByTestId("action-end-activation").click();
  await app.pitch.waitForCameraToSettle();
  const beforeState = await cameraState(page);
  const before = beforeState.zoom;
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 100);
  await expect
    .poll(async () => {
      const state = await cameraState(page);
      return state.zoom;
    })
    .toBeLessThan(before);
});

test("turn handoff fits both teams, pauses, then fits the new team", async ({
  page,
}) => {
  const app = await openSpread(page);
  await sampleCamera(page);
  await app.hud.endTurn().click();

  await page.waitForTimeout(800);
  await expectTeamFits(page, app, 0);
  await expectTeamFits(page, app, 1, false, false);
  await page.screenshot({ path: test.info().outputPath("handoff-board.png") });
  await page.waitForTimeout(1600);
  await expectTeamFits(page, app, 1);
  const samples = await finishCameraSample(page, test.info(), "handoff-frames");
  const still = samples.filter((s) => !s.zooming && !s.panning);
  expect(still.length).toBeGreaterThan(2);
  expect(fixtureValue(still.at(-1)).zoom).toBeGreaterThan(
    Math.min(...still.map((s) => s.zoom))
  );
  await page.screenshot({
    path: test.info().outputPath("handoff-next-team.png"),
  });
});

for (const afterMs of [250, 900]) {
  test(`resizing at ${String(afterMs)}ms preserves the next-team handoff`, async ({
    page,
  }) => {
    const app = await openSpread(page);
    await app.hud.endTurn().click();
    await page.waitForTimeout(afterMs);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(2200);
    await expectTeamFits(page, app, 1);
  });
}

test("resizing during a team zoom keeps every eligible player visible", async ({
  page,
}) => {
  const app = await openSpread(page);
  await app.hud.declareAction("team1:0", "move");
  await page.getByTestId("action-end-activation").click();
  await expect
    .poll(async () => {
      const state = await cameraState(page);
      return state.zooming;
    })
    .toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expectTeamFits(page, app, 0, true);
});

for (const afterMs of [250, 700]) {
  test(`selection at ${String(afterMs)}ms cancels the obsolete handoff fit`, async ({
    page,
  }) => {
    const app = await openSpread(page);
    await app.hud.endTurn().click();
    await page.waitForTimeout(afterMs);
    const square = await app.pitch.squareOf("team2:0");
    const point = await page.evaluate((s) => {
      const bridge = (
        globalThis as unknown as {
          __bbTestBridge: import("../../src/testing/browserBridge").BrowserTestBridge;
        }
      ).__bbTestBridge;
      const canvas = (document
        .querySelector("#game-container canvas"))!
        .getBoundingClientRect();
      const size = bridge.canvasSize();
      const p = (bridge.squareToCanvas(s.x, s.y))!;
      return {
        x: canvas.left + (p.x * canvas.width) / size.width,
        y: canvas.top + (p.y * canvas.height) / size.height,
      };
    }, square);
    await page.mouse.click(point.x, point.y);
    const requestedId = await app.bridge.resolveRef("team2:0");
    await expect
      .poll(async () => {
        const logged = await app.bridge.events();
        const event = logged.findLast((e) => e.name === GameEventNames.PlayerSelected);
        return event?.data;
      })
      .toMatchObject({ player: { id: requestedId } });
    await app.pitch.waitForCameraToSettle();
    await sampleCamera(page);
    await page.waitForTimeout(2200);
    const samples = await finishCameraSample(
      page,
      test.info(),
      "cancelled-handoff-frames"
    );
    expectZoomHeld(samples);
    expect(new Set(samples.map((s) => JSON.stringify(s.centre))).size).toBe(1);
    expect(samples.some((s) => s.panning || s.zooming)).toBe(false);
  });
}

test("loading another scenario during handoff cancels the obsolete destination", async ({
  page,
}) => {
  const app = await openSpread(page);
  await app.hud.endTurn().click();
  await page.waitForTimeout(250);
  await app.sandbox.loadCoreScenario("near-corner-blitz");
  await app.pitch.waitForCameraToSettle();
  await sampleCamera(page);
  await page.waitForTimeout(2200);
  const samples = await finishCameraSample(
    page,
    test.info(),
    "restored-handoff-frames"
  );
  expectZoomHeld(samples);
  expect(new Set(samples.map((s) => JSON.stringify(s.centre))).size).toBe(1);
  expect(samples.some((s) => s.panning || s.zooming)).toBe(false);
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("turn handoff cuts to the next team and leaves no delayed camera work", async ({
    page,
  }) => {
    const app = await openSpread(page);
    await app.hud.endTurn().click();
    await expectTeamFits(page, app, 1);
    await sampleCamera(page);
    await page.waitForTimeout(2100);
    expectZoomHeld(
      await finishCameraSample(page, test.info(), "reduced-motion-handoff")
    );
    expect(await cameraState(page)).toMatchObject({
      panning: false,
      zooming: false,
    });
  });
});
