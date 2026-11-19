import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect, refuseBrowserFixture } from "../support/engineTest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";

test("drives a headless game with no browser fixtures", async () => {
  const game = new HeadlessGame({ seed: 1, startingPhase: GamePhase.SETUP });
  const snapshot = game.snapshot();

  expect(snapshot.phase).toBe(GamePhase.SETUP);
  expect(snapshot.teams).toHaveLength(2);
  expect(fixtureValue(snapshot.teams[0]).players.length).toBeGreaterThan(0);
});

test("browser fixtures are refused in the engine project", () => {
  expect(() => refuseBrowserFixture("page")).toThrow(
    /engine-scenarios is a browser-free project/
  );
  expect(() => refuseBrowserFixture("page")).toThrow(/e2e\/browser/);
});
