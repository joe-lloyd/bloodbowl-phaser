export const DEFAULT_LEGACY_SEED = 1;

import { type Scenario } from "../../types/Scenario";
import {
  type ObservedRun,
  type ScenarioCase,
  type ExpectedCheckpoint,
} from "./types";

function setupLoadedCheckpoint(scenario: Scenario): ExpectedCheckpoint {
  const { team1Placements, team2Placements, ballPosition } = scenario.setup;
  return {
    id: "legacy-setup-loaded",
    description: `${scenario.name} loads its placements, ball and phase`,
    layers: ["engine", "browser"],
    assert(observed: ObservedRun) {
      const snapshot = observed.initialSnapshot;
      const expectPlaced = (
        teamIndex: number,
        placements: typeof team1Placements
      ) => {
        for (const placement of placements) {
          const player =
            snapshot.teams[teamIndex]?.players[placement.playerIndex];
          if (!player) {
            throw new Error(
              `${scenario.id}: no player at index ${String(placement.playerIndex)} of team${String(teamIndex + 1)}`
            );
          }
          if (
            player.position?.x !== placement.x ||
            player.position?.y !== placement.y
          ) {
            throw new Error(
              `${scenario.id}: ${player.name} should start at ` +
                `(${String(placement.x)},${String(placement.y)}) but is at ` +
                (player.position
                  ? `(${String(player.position.x)},${String(player.position.y)})`
                  : "off-pitch")
            );
          }
        }
      };
      expectPlaced(0, team1Placements);
      expectPlaced(1, team2Placements);

      if (ballPosition) {
        const ball = snapshot.ballPosition;
        if (ball?.x !== ballPosition.x || ball?.y !== ballPosition.y) {
          throw new Error(
            `${scenario.id}: ball should start at (${String(ballPosition.x)},${String(ballPosition.y)}) ` +
              `but is at ${ball ? `(${String(ball.x)},${String(ball.y)})` : "nowhere"}`
          );
        }
      }
      if (snapshot.phase !== scenario.setup.phase) {
        throw new Error(
          `${scenario.id}: should load in phase ${scenario.setup.phase}, got ${snapshot.phase}`
        );
      }
    },
  };
}

export function isSeededScenario(scenario: Scenario): boolean {
  return typeof scenario.seed === "number" && Number.isFinite(scenario.seed);
}

export function scenarioCaseFromLegacy(scenario: Scenario): ScenarioCase {
  const seed = isSeededScenario(scenario)
    ? scenario.seed!
    : DEFAULT_LEGACY_SEED;

  return {
    id: `legacy-${scenario.id}`,
    name: scenario.name,
    description: scenario.description,
    capability: "legacy-sandbox-scenario",
    interactions: [`sandbox-scenario:${scenario.id}`],
    setup: scenario.setup,
    steps: [],
    layers: ["engine"],
    interactive: true,
    source: { kind: "legacy-scenario", id: scenario.id },
    variants: [
      {
        id: "committed",
        name: scenario.expectedOutcome ?? "loads as defined",
        seed,
        expectedOutcome:
          scenario.expectedOutcome ??
          `${scenario.name} loads its committed setup`,
        interactive: true,
      },
    ],
    checkpoints: [setupLoadedCheckpoint(scenario)],
  };
}

export function scenarioCasesFromLegacy(scenarios: Scenario[]): ScenarioCase[] {
  return scenarios.map((scenario) => scenarioCaseFromLegacy(scenario));
}
