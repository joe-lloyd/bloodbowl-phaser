/**
 * Promotes the existing sandbox `Scenario` list into scenario cases.
 *
 * Nothing about `Scenario` changes: it stays the pitch/setup payload the
 * loader and sandbox already use, and scenarios without E2E metadata keep
 * loading exactly as before. This adapter simply makes the seeded ones
 * visible to the E2E registry and the coverage report, so a legacy scenario
 * is a gap the report can name rather than an invisible omission.
 *
 * Every scenario is promoted, seeded or not. The checkpoint below asserts
 * that the declared placements, ball and phase actually materialise, which
 * needs no dice at all — so an unseeded scenario still has something real to
 * prove. Unseeded scenarios simply run on a pinned default seed, which is
 * recorded on the variant like any other committed seed.
 */

/**
 * The seed an unseeded scenario runs on. Any fixed value works — the
 * promoted case asserts setup, not outcome — but it must be *fixed*, so the
 * run is reproducible and the sandbox URL in a bug report reloads the same
 * board.
 */
export const DEFAULT_LEGACY_SEED = 1;

import { Scenario } from "../../types/Scenario";
import { ObservedRun, ScenarioCase, ExpectedCheckpoint } from "./types";

/** The setup a legacy scenario asked for actually materialised on the pitch. */
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
          const player = snapshot.teams[teamIndex].players[placement.playerIndex];
          if (!player) {
            throw new Error(
              `${scenario.id}: no player at index ${placement.playerIndex} of team${teamIndex + 1}`
            );
          }
          if (
            player.position?.x !== placement.x ||
            player.position?.y !== placement.y
          ) {
            throw new Error(
              `${scenario.id}: ${player.name} should start at ` +
                `(${placement.x},${placement.y}) but is at ` +
                `${player.position ? `(${player.position.x},${player.position.y})` : "off-pitch"}`
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
            `${scenario.id}: ball should start at (${ballPosition.x},${ballPosition.y}) ` +
              `but is at ${ball ? `(${ball.x},${ball.y})` : "nowhere"}`
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

/** Does this legacy scenario carry its own committed seed? */
export function isSeededScenario(scenario: Scenario): boolean {
  return typeof scenario.seed === "number" && Number.isFinite(scenario.seed);
}

/**
 * Wrap a legacy scenario as a scenario case. The case has no steps: it
 * proves the scenario still loads as advertised on its committed seed, which
 * is exactly the guarantee the sandbox relies on. Hand-written cases add the
 * interaction steps on top.
 */
export function scenarioCaseFromLegacy(scenario: Scenario): ScenarioCase {
  const seed = isSeededScenario(scenario)
    ? (scenario.seed as number)
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

/** Every legacy scenario, in the order the sandbox lists them. */
export function scenarioCasesFromLegacy(
  scenarios: Scenario[]
): ScenarioCase[] {
  return scenarios.map(scenarioCaseFromLegacy);
}
