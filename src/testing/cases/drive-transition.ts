/**
 * Drive-transition scenario cases, mirroring
 * `__tests__/headless/driveTransition.test.ts`: the touchdown -> KO recovery
 * -> setup -> kickoff sequence a Sevens match walks between drives.
 */

import { PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { ScenarioCase, step } from "../scenarioCase/types";
import { playSetup, emitted, checkpointAssert, playerIn } from "./helpers";

/**
 * Knocked-out players roll to recover when the drive ends.
 *
 * This is the one phase-flow rule that only fires *between* drives, so it
 * needs a drive to actually end: the carrier scores, and the reset rolls
 * recovery for everyone in the KO box.
 */
const koRecovery: ScenarioCase = {
  id: "match-ko-recovery-at-drive-end",
  name: "KO recovery when the drive ends",
  description:
    "A knocked-out player rolls D6 at the end of the drive: 4+ returns them " +
    "to Reserves, anything less leaves them in the KO box for the next one.",
  capability: "phase-flow",
  interactions: ["phase:TOUCHDOWN", "phase:SETUP"],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 3, y: 3 },
      // Off the pitch in the KO box, waiting for the drive to end.
      { playerIndex: 2, x: 4, y: 4, status: PlayerStatus.KO },
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
      "score, ending the drive"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "rolled",
      name: "Recovery rolled",
      seed: 5,
      expectedOutcome:
        "the drive ends, the KO'd player is rolled for, and their status " +
        "matches the roll",
    },
  ],
  checkpoints: [
    emitted(GameEventNames.Touchdown),
    emitted(GameEventNames.KORecoveryRolled),
    {
      id: "status-agrees-with-the-roll",
      description: "the KO'd player's status matches what they rolled",
      layers: ["engine"],
      assert(observed) {
        const roll = observed.events.find(
          (event) => event.name === GameEventNames.KORecoveryRolled
        )?.data as { roll: number; recovered: boolean } | undefined;
        checkpointAssert(!!roll, "the drive end must roll KO recovery");
        checkpointAssert(
          roll!.recovered === roll!.roll >= 4,
          `a ${roll!.roll} should ${roll!.roll >= 4 ? "" : "not "}recover, ` +
            `but recovered=${roll!.recovered}`
        );

        const player = playerIn(observed, "team1:2");
        const expected = roll!.recovered
          ? PlayerStatus.RESERVE
          : PlayerStatus.KO;
        checkpointAssert(
          player.status === expected,
          `after rolling ${roll!.roll} the player should be ${expected}, ` +
            `but is ${player.status}`
        );
      },
    },
  ],
};

export const DRIVE_TRANSITION_CASES: ScenarioCase[] = [koRecovery];
