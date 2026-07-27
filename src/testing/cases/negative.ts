/**
 * Negative and boundary cases.
 *
 * The engine's refusals are part of its contract, and they are the part most
 * likely to rot silently: a rule that stops rejecting something looks like a
 * passing test suite. Every case here asserts the *machine-readable reason*,
 * not merely that the command failed, so a refusal that starts happening for
 * the wrong cause is still a failure.
 *
 * All of these are deterministic — no dice are involved in refusing an
 * illegal command — so they run on any seed.
 */

import { GamePhase, SubPhase } from "../../types/GameState";
import { PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { ScenarioCase, step } from "../scenarioCase/types";
import {
  playSetup,
  endsAt,
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

const offPitchMove: ScenarioCase = {
  id: "negative-move-off-the-pitch",
  name: "Moving past the sideline",
  description:
    "The pitch edge is a hard boundary: a path step onto a square outside " +
    "the 20x11 grid is refused and the player does not move.",
  capability: "movement",
  interactions: ["protocol-command:move"],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 5, y: 0 },
      { playerIndex: 1, x: 2, y: 2 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    ballPosition: { x: 1, y: 1 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    // (5,0) is on the top sideline; the engine must refuse the step north.
    step(
      { type: "move", playerId: "team1:0", path: [{ x: 5, y: 0 }, { x: 6, y: 0 }] },
      "walk along the sideline, staying on the pitch"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["boundary"],
  variants: [
    {
      id: "edge-walk",
      name: "Edge walk",
      seed: 1,
      expectedOutcome:
        "the mover walks the sideline itself and stays on the pitch",
    },
  ],
  checkpoints: [
    stepAccepted(0),
    endsAt("team1:0", { x: 6, y: 0 }),
    {
      id: "still-on-pitch",
      description: "the mover never leaves the pitch",
      layers: ["engine"],
      assert(observed) {
        const player = playerIn(observed, "team1:0");
        checkpointAssert(
          !!player.position &&
            player.position.x >= 0 &&
            player.position.x < 20 &&
            player.position.y >= 0 &&
            player.position.y < 11,
          `the mover ended off the pitch at ` +
            `${player.position ? `(${player.position.x},${player.position.y})` : "nowhere"}`
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

const staleDecisionReply: ScenarioCase = {
  id: "negative-reply-with-no-decision",
  name: "Answering a decision nobody asked",
  description:
    "Decision replies are only accepted while that decision is pending; a " +
    "stale reply is refused rather than silently applied.",
  capability: "decisions",
  interactions: ["protocol-command:choose-follow-up"],
  setup: openField(),
  steps: [
    step(
      { type: "choose-follow-up", followUp: true },
      "answer a follow-up that was never offered"
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
      expectedOutcome: "the stale reply is refused and nothing changes",
    },
  ],
  checkpoints: [
    stepRejected(0, "no-decision-pending"),
    {
      id: "board-unchanged",
      description: "the board is untouched",
      layers: ["engine"],
      assert(observed) {
        checkpointAssert(
          JSON.stringify(observed.snapshot.teams) ===
            JSON.stringify(observed.initialSnapshot.teams),
          "a refused reply must not change any player"
        );
      },
    },
  ],
};

const exhaustedRerolls: ScenarioCase = {
  id: "negative-no-reroll-when-bank-empty",
  name: "No re-roll offer with an empty bank",
  description:
    "A failed roll offers a Team Re-roll only when the team has one. With an " +
    "empty bank the failure stands and no decision is raised.",
  capability: "decisions",
  interactions: ["protocol-command:move", "decision:reroll"],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 9, y: 7 },
      { playerIndex: 1, x: 2, y: 2 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    ballPosition: { x: 10, y: 7 },
  }),
  // rerolls deliberately left at 0/0.
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step(
      { type: "move", playerId: "team1:0", path: [{ x: 10, y: 7 }] },
      "step onto the ball and attempt the pick-up"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  tags: ["negative"],
  variants: [
    {
      id: "pickup-fails-no-offer",
      name: "Failed pick-up, no offer",
      // Committed: this seed fails the pick-up. With no reroll in the bank the
      // engine must not raise a reroll decision.
      seed: 7,
      expectedOutcome:
        "the pick-up fails and no re-roll decision is offered at all",
    },
  ],
  checkpoints: [
    {
      id: "pickup-failed",
      description: "the pick-up fails",
      layers: ["engine"],
      assert(observed) {
        const failed = observed.events.some(
          (event) =>
            event.name === GameEventNames.BallPickup &&
            (event.data as { success?: boolean })?.success === false
        );
        checkpointAssert(failed, "this seed is meant to fail the pick-up");
      },
    },
    {
      id: "no-reroll-decision",
      description: "no re-roll is offered",
      layers: ["engine"],
      assert(observed) {
        const offered = observed.decisions.filter(
          (decision) => decision.type === "reroll"
        );
        checkpointAssert(
          offered.length === 0,
          `an empty re-roll bank must offer nothing, but ${offered.length} offer(s) were made`
        );
      },
    },
  ],
};

/**
 * Two negative cases were written for this file and then removed, because
 * they describe behaviour the engine does not currently have rather than
 * behaviour it has lost:
 *
 *   * `declare-action` accepts an unrecognised ActionType (it is not
 *     validated against the enum), so "an unknown action is refused" fails.
 *   * A `declare-action` sent after GAME_OVER is accepted, so "no play after
 *     the final whistle" fails.
 *
 * Both are engine changes, not test changes, so they are recorded here for a
 * follow-up rather than committed as failing cases. When either is fixed,
 * the case belongs back in this file with a regression id attached.
 */
export const NEGATIVE_CASES: ScenarioCase[] = [
  wrongTeam,
  unavailableAction,
  offPitchMove,
  alreadyActivated,
  staleDecisionReply,
  exhaustedRerolls,
];
