/**
 * Proves the engine project's core promise: it runs a real game without a
 * browser, and asking for one is an error rather than a silent cost.
 */

import { test, expect, refuseBrowserFixture } from "../support/engineTest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";

test("drives a headless game with no browser fixtures", async () => {
  const game = new HeadlessGame({ seed: 1, startingPhase: GamePhase.SETUP });
  const snapshot = game.snapshot();

  expect(snapshot.phase).toBe(GamePhase.SETUP);
  expect(snapshot.teams).toHaveLength(2);
  expect(snapshot.teams[0].players.length).toBeGreaterThan(0);
});

test("browser fixtures are refused in the engine project", () => {
  // The `page`/`context`/`browser` fixtures in engineTest.ts are wired to
  // this guard, so a spec that requests one fails at setup with a message
  // pointing at e2e/browser instead of quietly launching Chromium.
  expect(() => refuseBrowserFixture("page")).toThrow(
    /engine-scenarios is a browser-free project/
  );
  expect(() => refuseBrowserFixture("page")).toThrow(/e2e\/browser/);
});
