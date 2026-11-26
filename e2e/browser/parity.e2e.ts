import { fixtureValue } from "../../src/testing/fixtureValue";
import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";

import { MOVEMENT_CASES } from "../../src/testing/cases/movement";
import { runCaseInEngine } from "../../src/testing/adapters/engineAdapter";
import { performSteps } from "../support/browserAdapter";
import { GameApp } from "../support/pages/game";
import {
  runCaseInBrowser,
  assertBrowserCheckpoints,
} from "../support/browserRunner";

const scenarioCase = MOVEMENT_CASES[0];
const variant = fixtureValue(scenarioCase).variants[0];

const GAMEPLAY_EVENTS = new Set<string>([
  GameEventNames.PlayerMoved,
  GameEventNames.DiceRoll,
  GameEventNames.Turnover,
  GameEventNames.PlayerKnockedDown,
  GameEventNames.BallPickup,
  GameEventNames.TurnStarted,
]);

test.describe(`parity: ${fixtureValue(scenarioCase).id}`, () => {
  test("reaches the same state and gameplay events in both lanes", async ({
    page,
  }) => {
    const engine = await runCaseInEngine(fixtureValue(scenarioCase), fixtureValue(variant));

    const app = new GameApp(page);
    await app.sandbox.open({
      scenario: fixtureValue(scenarioCase).id,
      outcome: fixtureValue(variant).id,
      seed: fixtureValue(variant).seed,
    });

    const beforeBrowser = await app.bridge.snapshot();
    expect(positions(beforeBrowser)).toEqual(positions(engine.initialSnapshot));
    expect(beforeBrowser.ballPosition).toEqual(
      engine.initialSnapshot.ballPosition
    );

    const eventsBefore = await app.bridge.events();
    const eventsBeforeSteps = eventsBefore.length;

    await performSteps({ app, page }, fixtureValue(scenarioCase).steps);

    await expect
      .poll(async () => {
        const snapshot = await app.bridge.snapshot();
        return fixtureValue(fixtureValue(snapshot.teams[0]).players[0]).position;
      })
      .toEqual(fixtureValue(fixtureValue(engine.snapshot.teams[0]).players[0]).position);

    const afterBrowser = await app.bridge.snapshot();
    expect(positions(afterBrowser)).toEqual(positions(engine.snapshot));
    expect(afterBrowser.ballPosition).toEqual(engine.snapshot.ballPosition);
    expect(statuses(afterBrowser)).toEqual(statuses(engine.snapshot));

    const browserEventLog = await app.bridge.events(eventsBeforeSteps);
    const browserEvents = browserEventLog
      .map((event) => event.name)
      .filter((name) => GAMEPLAY_EVENTS.has(name));
    const engineEvents = engine.events
      .map((event) => event.name)
      .filter((name) => GAMEPLAY_EVENTS.has(name));
    expect(browserEvents).toEqual(engineEvents);
  });

  test("the browser lane satisfies the case's own checkpoints", async ({
    page,
  }, testInfo) => {
    const { observed } = await runCaseInBrowser(page, fixtureValue(scenarioCase), fixtureValue(variant));
    assertBrowserCheckpoints(testInfo, fixtureValue(scenarioCase), fixtureValue(variant), observed);
  });
});

function positions(snapshot: {
  teams: { players: { position: { x: number; y: number } | null }[] }[];
}): Record<string, { x: number; y: number } | null> {
  const out: Record<string, { x: number; y: number } | null> = {};
  for (const [teamIndex, team] of snapshot.teams.entries()) {
    for (const [playerIndex, player] of team.players.entries()) {
      out[`team${String(teamIndex + 1)}:${String(playerIndex)}`] =
        player.position;
    }
  }
  return out;
}

function statuses(snapshot: {
  teams: { players: { status: string }[] }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [teamIndex, team] of snapshot.teams.entries()) {
    for (const [playerIndex, player] of team.players.entries()) {
      out[`team${String(teamIndex + 1)}:${String(playerIndex)}`] =
        player.status;
    }
  }
  return out;
}
