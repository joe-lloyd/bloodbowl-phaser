/**
 * Activation scenario cases: declaring, cancelling and re-declaring an
 * action, and the legality checks around whose turn it is and who may act.
 *
 * No single `__tests__/headless/*.test.ts` file owns "activation" by name —
 * the nearest headless coverage is spread across `HeadlessGame.test.ts` and
 * `defer-action-commitment.test.ts` — so this is the section's own home
 * (see docs/E2E_TESTING.md's case-organization note).
 */

import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { ScenarioCase, step } from "../scenarioCase/types";
import {
  playSetup,
  stepRejected,
  stepAccepted,
  notEmitted,
  checkpointAssert,
  playerIn,
} from "./helpers";

/** A shared two-player board: team1 mover, a distant team2 opponent. */
const openField = () =>
  playSetup({
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 2, y: 2 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    ballPosition: { x: 1, y: 1 },
  });

const wrongTeam: ScenarioCase = {
  id: "negative-wrong-team-activation",
  name: "Activating an opponent",
  description:
    "A coach may only activate their own players; declaring an action for the " +
    "inactive team's player is refused and changes nothing.",
  capability: "activation",
  interactions: ["protocol-command:declare-action"],
  setup: openField(),
  steps: [
    step(
      { type: "declare-action", playerId: "team2:0", action: "move" },
      "team1's coach tries to activate a team2 player"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["negative"],
  variants: [
    {
      id: "refused",
      name: "Refused",
      seed: 1,
      expectedOutcome: "the declaration is refused and no action is declared",
    },
  ],
  checkpoints: [
    // The engine refuses this as an illegal declaration rather than with a
    // team-specific reason; asserting the actual reason keeps the case
    // honest about which rule did the refusing.
    stepRejected(0, "illegal-action-declaration"),
    {
      id: "no-active-player",
      description: "nothing is activated",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          observed.snapshot.activePlayer === null,
          `no player should be activated, but ${observed.snapshot.activePlayer?.id} is`
        );
      },
    },
  ],
};

const unavailableAction: ScenarioCase = {
  id: "negative-prone-player-cannot-block",
  name: "A prone player may not block",
  description:
    "Block requires a Standing player. A prone player's declaration is " +
    "refused and no block dice are rolled even if the command is forced.",
  capability: "activation",
  interactions: ["protocol-command:declare-action", "protocol-command:block"],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 10, y: 7, status: PlayerStatus.PRONE },
      { playerIndex: 1, x: 5, y: 5 },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 7 }],
    ballPosition: { x: 1, y: 1 },
  }),
  steps: [
    step(
      { type: "declare-action", playerId: "team1:0", action: "block" },
      "a prone player declares Block"
    ),
    step(
      { type: "block", attackerId: "team1:0", defenderId: "team2:0" },
      "and then throws it anyway"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["negative"],
  variants: [
    {
      id: "refused",
      name: "Refused",
      seed: 3,
      expectedOutcome:
        "the declaration is refused and no block dice are ever rolled",
    },
  ],
  checkpoints: [
    stepRejected(0, "illegal-action-declaration"),
    notEmitted(GameEventNames.BlockDiceRolled),
    {
      id: "still-prone",
      description: "the player is still prone",
      layers: ["engine"],
      assert(observed) {
        const player = playerIn(observed, "team1:0");
        checkpointAssert(
          player.status === PlayerStatus.PRONE,
          `the blocker should still be prone, but is ${player.status}`
        );
      },
    },
  ],
};

const alreadyActivated: ScenarioCase = {
  id: "negative-second-activation-refused",
  name: "One activation per player per turn",
  description:
    "A player who has finished their action may not act again this turn.",
  capability: "activation",
  interactions: [
    "protocol-command:declare-action",
    "protocol-command:end-activation",
  ],
  setup: openField(),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step({ type: "end-activation", playerId: "team1:0" }, "finish the action"),
    step(
      { type: "declare-action", playerId: "team1:0", action: "move" },
      "the same player tries to act again"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["negative"],
  variants: [
    {
      id: "refused",
      name: "Refused",
      seed: 1,
      expectedOutcome:
        "the second declaration is refused; a team-mate can still act",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    stepAccepted(1),
    stepRejected(2, "illegal-action-declaration"),
    {
      id: "activation-recorded",
      description: "the player is recorded as having acted",
      layers: ["engine"],
      assert(observed) {
        const player = playerIn(observed, "team1:0");
        checkpointAssert(
          observed.snapshot.turn.activatedPlayerIds.includes(player.id),
          "the finished player should be in activatedPlayerIds"
        );
      },
    },
  ],
};

/**
 * A declared action can be taken back until something has happened. This is
 * the "I misclicked" path, and it must leave no trace.
 */
const cancelAction: ScenarioCase = {
  id: "activation-cancel-declared-action",
  name: "Cancelling a declared action",
  description:
    "A player who has declared an action but not yet acted can cancel it, " +
    "freeing them to declare a different one.",
  capability: "activation",
  interactions: [
    "protocol-command:cancel-action",
    "protocol-command:declare-action",
  ],
  setup: openField(),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step({ type: "cancel-action", playerId: "team1:0" }, "take it back"),
    step(
      { type: "declare-action", playerId: "team1:0", action: "pass" },
      "declare something else instead"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["match-flow"],
  variants: [
    {
      id: "cancelled",
      name: "Cancelled and re-declared",
      seed: 1,
      expectedOutcome:
        "the first declaration is taken back and a different one is accepted",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    stepAccepted(1),
    stepAccepted(2),
    {
      id: "re-declared",
      description: "the player ends up on the second action, not the first",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          observed.snapshot.activePlayer?.action === "pass",
          `expected the re-declared 'pass' action, got ` +
            `${observed.snapshot.activePlayer?.action ?? "none"}`
        );
      },
    },
  ],
};

export const ACTIVATION_CASES: ScenarioCase[] = [
  wrongTeam,
  unavailableAction,
  alreadyActivated,
  cancelAction,
];
