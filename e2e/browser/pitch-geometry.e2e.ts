/**
 * The foundation every other browser case stands on: the sandbox loads a
 * scenario from its URL, the read-only bridge reports the state the engine
 * actually holds, and the pitch page object's grid→canvas mapping agrees
 * with the production geometry.
 *
 * If this file fails, canvas clicks elsewhere are landing on the wrong
 * square and no other browser result should be trusted.
 */

import { test, expect } from "@playwright/test";
import { GameApp } from "../support/pages/game";
import { GameConfig } from "../../src/config/GameConfig";
import { SCENARIOS } from "../../src/data/scenarios";

const SCENARIO_ID = "basic-scrimmage";

test.describe("pitch geometry and the test bridge", () => {
  test("loads a sandbox scenario from the URL and exposes its state", async ({
    page,
  }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    const scenario = SCENARIOS.find((s) => s.id === SCENARIO_ID)!;
    const snapshot = await app.bridge.snapshot();

    // Every placement the scenario declares is where it said it would be.
    for (const placement of scenario.setup.team1Placements) {
      const player = snapshot.teams[0].players[placement.playerIndex];
      expect(player.position, `team1:${placement.playerIndex}`).toEqual({
        x: placement.x,
        y: placement.y,
      });
    }
    for (const placement of scenario.setup.team2Placements) {
      const player = snapshot.teams[1].players[placement.playerIndex];
      expect(player.position, `team2:${placement.playerIndex}`).toEqual({
        x: placement.x,
        y: placement.y,
      });
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

    const box = (await app.pitch.canvas.boundingBox())!;
    // A click outside this box would silently hit the page, not the game.
    for (const [gridX, gridY] of [
      [0, 0],
      [GameConfig.PITCH_WIDTH - 1, 0],
      [0, GameConfig.PITCH_HEIGHT - 1],
      [GameConfig.PITCH_WIDTH - 1, GameConfig.PITCH_HEIGHT - 1],
      [10, 5],
    ] as const) {
      const point = await app.pitch.viewportPoint({ x: gridX, y: gridY });
      expect(point.x, `(${gridX},${gridY}).x`).toBeGreaterThanOrEqual(box.x);
      expect(point.x).toBeLessThanOrEqual(box.x + box.width);
      expect(point.y, `(${gridX},${gridY}).y`).toBeGreaterThanOrEqual(box.y);
      expect(point.y).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  test("clicking a player's square selects that player", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    await app.pitch.clickPlayer("team1:0");

    // The action menu naming that player is the game's own confirmation that
    // the click resolved to the right square.
    await expect(app.hud.actionMenu()).toBeVisible();
    const snapshot = await app.bridge.snapshot();
    const selected = snapshot.teams[0].players[0];
    await expect(app.hud.actionMenu()).toContainText(selected.name);
  });

  test("the bridge cannot mutate game state", async ({ page }) => {
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO_ID });

    // No command surface is exposed at all…
    const surface = await page.evaluate(() =>
      Object.keys(
        (window as unknown as Record<string, Record<string, unknown>>)
          .__bbTestBridge
      ).sort()
    );
    expect(surface).not.toContain("execute");
    expect(surface).toEqual([
      "canvasSize",
      "events",
      "pendingDecision",
      "phase",
      "scenes",
      "snapshot",
      "squareToCanvas",
      "teams",
      "version",
    ]);

    // …and what it returns is a clone, so editing it changes nothing.
    const before = await app.bridge.snapshot();
    await page.evaluate(() => {
      const bridge = (
        window as unknown as Record<
          string,
          { snapshot(): { ballPosition: { x: number; y: number } | null } }
        >
      ).__bbTestBridge;
      const snapshot = bridge.snapshot();
      if (snapshot.ballPosition) snapshot.ballPosition.x = 99;
    });
    const after = await app.bridge.snapshot();
    expect(after.ballPosition).toEqual(before.ballPosition);
  });
});
