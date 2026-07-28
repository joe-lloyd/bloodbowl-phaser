/**
 * Drive-reset scenario cases, mirroring `__tests__/headless/driveReset.test.ts`:
 * a carrier walking into the end zone scores, and the drive resets — the
 * pitch clears and the next setup begins.
 */

import { GamePhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { ScenarioCase, step } from "../scenarioCase/types";
import { playSetup, stepAccepted, emitted, checkpointAssert } from "./helpers";

/**
 * A carrier walking into the end zone scores, and the drive resets: the
 * pitch clears and the next setup begins.
 */
const touchdown: ScenarioCase = {
  id: "match-touchdown-and-drive-reset",
  name: "Touchdown and drive reset",
  description:
    "A carrier who reaches the opposing end zone scores; the score updates, " +
    "the drive ends, and the match returns to SETUP for the next kickoff.",
  capability: "phase-flow",
  interactions: [
    "protocol-command:move",
    "phase:TOUCHDOWN",
    "phase:SETUP",
  ],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 3, y: 3 },
    ],
    team2Placements: [{ playerIndex: 0, x: 13, y: 9 }],
    ballPosition: { x: 17, y: 5 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step(
      {
        type: "move",
        playerId: "team1:0",
        path: [
          { x: 18, y: 5 },
          { x: 19, y: 5 },
        ],
      },
      "walk the ball into the end zone"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "scored",
      name: "Touchdown scored",
      seed: 5,
      expectedOutcome:
        "the carrier scores, the score becomes 1-0, and the next drive's setup begins",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    emitted(GameEventNames.Touchdown),
    {
      id: "score-updated",
      description: "the scoring team is one up",
      layers: ["engine"],
      assert(observed) {
        const teamId = observed.snapshot.teams[0].id;
        checkpointAssert(
          observed.snapshot.score[teamId] === 1,
          `team1 should have scored once, score is ${JSON.stringify(observed.snapshot.score)}`
        );
      },
    },
    {
      id: "drive-reset",
      description: "the pitch is cleared for the next drive",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          observed.snapshot.phase === GamePhase.SETUP,
          `after a touchdown the match should return to SETUP, got ${observed.snapshot.phase}`
        );
        const stillPlaced = observed.snapshot.teams
          .flatMap((team) => team.players)
          .filter((player) => player.position);
        checkpointAssert(
          stillPlaced.length === 0,
          `the drive reset should clear the pitch, but ${stillPlaced.length} player(s) remain`
        );
        checkpointAssert(
          observed.snapshot.ballPosition === null,
          "the drive reset should take the ball off the pitch"
        );
      },
    },
  ],
};

export const DRIVE_RESET_CASES: ScenarioCase[] = [touchdown];
