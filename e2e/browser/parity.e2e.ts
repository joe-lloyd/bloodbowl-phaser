/**
 * Engine/browser parity.
 *
 * The whole point of the shared scenario-case contract is that one setup,
 * one seed and one semantic script produce the same game in either lane. This
 * proves it on a case chosen to make disagreement visible rather than
 * plausible: an unopposed walk rolls nothing, so any divergence is a real
 * behavioural difference between the protocol and the UI, not RNG.
 */

import { test, expect } from "@playwright/test";
import { GameEventNames } from "../../src/types/events";
// Imports the `movement` section module directly, rather than the aggregate
// registry — this is the movement section's own case data, mirroring
// `__tests__/headless` per-section naming (see docs/E2E_TESTING.md).
import { MOVEMENT_CASES } from "../../src/testing/cases/movement";
import { runCaseInEngine } from "../../src/testing/adapters/engineAdapter";
import { performSteps } from "../support/browserAdapter";
import { GameApp } from "../support/pages/game";
import {
  runCaseInBrowser,
  assertBrowserCheckpoints,
} from "../support/browserRunner";

const scenarioCase = MOVEMENT_CASES[0];
const variant = scenarioCase.variants[0];

/** Events that describe gameplay, not presentation or UI chrome. */
const GAMEPLAY_EVENTS = new Set<string>([
  GameEventNames.PlayerMoved,
  GameEventNames.DiceRoll,
  GameEventNames.Turnover,
  GameEventNames.PlayerKnockedDown,
  GameEventNames.BallPickup,
  GameEventNames.TurnStarted,
]);

test.describe(`parity: ${scenarioCase.id}`, () => {
  test("reaches the same state and gameplay events in both lanes", async ({
    page,
  }) => {
    const engine = await runCaseInEngine(scenarioCase, variant);

    const app = new GameApp(page);
    await app.sandbox.open({
      scenario: scenarioCase.id,
      outcome: variant.id,
      seed: variant.seed,
    });

    // The two lanes must start from the same board, or nothing after this
    // means anything.
    const beforeBrowser = await app.bridge.snapshot();
    expect(positions(beforeBrowser)).toEqual(positions(engine.initialSnapshot));
    expect(beforeBrowser.ballPosition).toEqual(
      engine.initialSnapshot.ballPosition
    );

    // Everything the bridge has logged so far belongs to loading the
    // scenario and starting the drive — the browser really does start a turn
    // where the engine adapter is handed one already in progress. Only
    // events from here on are the case's own.
    const eventsBeforeSteps = (await app.bridge.events()).length;

    await performSteps({ app, page }, scenarioCase.steps);

    // The mover has arrived — poll, because the browser animates the walk.
    await expect
      .poll(async () => {
        const snapshot = await app.bridge.snapshot();
        return snapshot.teams[0].players[0].position;
      })
      .toEqual(engine.snapshot.teams[0].players[0].position);

    const afterBrowser = await app.bridge.snapshot();
    expect(positions(afterBrowser)).toEqual(positions(engine.snapshot));
    expect(afterBrowser.ballPosition).toEqual(engine.snapshot.ballPosition);
    expect(statuses(afterBrowser)).toEqual(statuses(engine.snapshot));

    // Gameplay events must match in kind and order. Presentation events are
    // deliberately excluded: the browser emits highlight/notification traffic
    // the protocol lane has no reason to.
    const browserEvents = (await app.bridge.events(eventsBeforeSteps))
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
    const { observed } = await runCaseInBrowser(page, scenarioCase, variant);
    assertBrowserCheckpoints(testInfo, scenarioCase, variant, observed);
  });
});

/** Player positions keyed by stable reference, so ids never enter the diff. */
function positions(snapshot: {
  teams: { players: { position: { x: number; y: number } | null }[] }[];
}): Record<string, { x: number; y: number } | null> {
  const out: Record<string, { x: number; y: number } | null> = {};
  snapshot.teams.forEach((team, teamIndex) => {
    team.players.forEach((player, playerIndex) => {
      out[`team${teamIndex + 1}:${playerIndex}`] = player.position;
    });
  });
  return out;
}

function statuses(snapshot: {
  teams: { players: { status: string }[] }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  snapshot.teams.forEach((team, teamIndex) => {
    team.players.forEach((player, playerIndex) => {
      out[`team${teamIndex + 1}:${playerIndex}`] = player.status;
    });
  });
  return out;
}
