import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameConfig } from "../../src/config/GameConfig";
import { SCENARIOS } from "../../src/data/scenarios";
import type { BrowserTestBridge } from "../../src/testing/browserBridge";

const SCENARIO_ID = "basic-scrimmage";

test.describe("pitch geometry and the test bridge", () => {
  test("loads a sandbox scenario from the URL and exposes its state", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    const scenario = fixtureValue(SCENARIOS.find((s) => s.id === SCENARIO_ID));
    const snapshot = await app.bridge.snapshot();

    for (const placement of scenario.setup.team1Placements) {
      const player = fixtureValue(snapshot.teams[0]).players[placement.playerIndex];
      expect(fixtureValue(player).position, `team1:${String(placement.playerIndex)}`).toEqual(
        {
          x: placement.x,
          y: placement.y,
        }
      );
    }
    for (const placement of scenario.setup.team2Placements) {
      const player = fixtureValue(snapshot.teams[1]).players[placement.playerIndex];
      expect(fixtureValue(player).position, `team2:${String(placement.playerIndex)}`).toEqual(
        {
          x: placement.x,
          y: placement.y,
        }
      );
    }
    expect(snapshot.ballPosition).toEqual(scenario.setup.ballPosition);
  });

  test("the grid mapping matches production geometry", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    await app.pitch.assertMappingMatchesProductionGeometry();
  });

  test("every square maps to a point inside the canvas element", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    const box = fixtureValue((await app.pitch.canvas.boundingBox()));

    for (const [gridX, gridY] of [
      [0, 0],
      [GameConfig.PITCH_WIDTH - 1, 0],
      [0, GameConfig.PITCH_HEIGHT - 1],
      [GameConfig.PITCH_WIDTH - 1, GameConfig.PITCH_HEIGHT - 1],
      [10, 5],
    ] as const) {
      const point = await app.pitch.viewportPoint({ x: gridX, y: gridY });
      expect(
        point.x,
        `(${String(gridX)},${String(gridY)}).x`
      ).toBeGreaterThanOrEqual(box.x);
      expect(point.x).toBeLessThanOrEqual(box.x + box.width);
      expect(
        point.y,
        `(${String(gridX)},${String(gridY)}).y`
      ).toBeGreaterThanOrEqual(box.y);
      expect(point.y).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  test("clicking a player's square selects that player", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    await app.pitch.clickPlayer("team1:0");

    await expect(app.hud.actionMenu()).toBeVisible();
    const snapshot = await app.bridge.snapshot();
    const selected = fixtureValue(snapshot.teams[0]).players[0];
    await expect(app.hud.actionMenu()).toContainText(fixtureValue(selected).name);
  });

  test("the bridge cannot mutate game state", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    const surface = await page.evaluate(() =>
      Object.keys(
        (window as unknown as Record<string, Record<string, unknown>>)[
          "__bbTestBridge"
        ]
      ).sort()
    );
    expect(surface).not.toContain("execute");
    expect(surface).toEqual([
      "cameraMoving",
      "cameraState",
      "canvasSize",
      "events",
      "pendingDecision",
      "phase",
      "pitchHighlights",
      "pitchLayers",
      "scenes",
      "snapshot",
      "squareToCanvas",
      "teams",
      "version",
    ]);

    const before = await app.bridge.snapshot();
    await page.evaluate(() => {
      const bridge = (
        window as unknown as Record<
          string,
          { snapshot(): { ballPosition: { x: number; y: number } | null } }
        >
      )["__bbTestBridge"];
      const snapshot = fixtureValue(bridge).snapshot();
      if (snapshot.ballPosition) snapshot.ballPosition.x = 99;
    });
    const after = await app.bridge.snapshot();
    expect(after.ballPosition).toEqual(before.ballPosition);

    const camera = await page.evaluate(() => {
      const bridge = (
        window as unknown as { __bbTestBridge: BrowserTestBridge }
      ).__bbTestBridge;
      const before = bridge.cameraState();
      const copy = bridge.cameraState();
      if (!copy) throw new Error("No live match camera");
      copy.zoom = 99;
      copy.centre.x = 99;
      return { before, after: bridge.cameraState() };
    });
    expect(camera.after).toEqual(camera.before);
  });
});
