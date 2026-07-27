/**
 * Movement scenario cases.
 *
 * These are the first cases written against the shared contract, and the
 * ones the engine/browser parity check runs on: a plain walk needs no dice,
 * so the two lanes must agree exactly rather than approximately.
 */

import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { ScenarioCase, step } from "../scenarioCase/types";
import {
  playSetup,
  endsAt,
  noTurnover,
  emitted,
  playerIn,
  checkpointAssert,
} from "./helpers";

/**
 * A clear walk: no opponent within a tackle zone of any square on the path,
 * and the distance is inside MA, so nothing is rolled. Deterministic in both
 * lanes for every seed, which is what makes it the parity anchor.
 */
const unopposedMove: ScenarioCase = {
  id: "movement-unopposed-walk",
  name: "Unopposed walk",
  description:
    "A player with a clear lane walks three squares: no dodge, no rush, no dice.",
  capability: "movement",
  interactions: ["declare-action:move", "move:normal"],
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      // A second player keeps the turn alive after the mover finishes.
      { playerIndex: 1, x: 2, y: 2 },
    ],
    // Far enough away that no square on the path is marked.
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    ballPosition: { x: 1, y: 1 },
  }),
  steps: [
    step(
      { type: "declare-action", playerId: "team1:0", action: "move" },
      "declare a Move"
    ),
    step(
      {
        type: "move",
        playerId: "team1:0",
        path: [
          { x: 6, y: 5 },
          { x: 7, y: 5 },
          { x: 8, y: 5 },
        ],
      },
      "walk three squares east"
    ),
  ],
  layers: ["engine", "browser"],
  interactive: true,
  tags: ["parity"],
  variants: [
    {
      id: "clear-lane",
      name: "Clear lane",
      seed: 1,
      expectedOutcome:
        "the mover reaches (8,5) having rolled nothing at all",
      interactive: true,
    },
  ],
  checkpoints: [
    endsAt("team1:0", { x: 8, y: 5 }),
    noTurnover(),
    emitted(GameEventNames.PlayerMoved),
    {
      id: "no-dice-rolled",
      description: "an unopposed walk inside MA rolls no dice",
      assert(observed) {
        const rolls = observed.events.filter(
          (event) => event.name === GameEventNames.DiceRoll
        );
        checkpointAssert(
          rolls.length === 0,
          `an unopposed walk must roll nothing, but rolled ${rolls
            .map((r) => (r.data as { rollType?: string })?.rollType)
            .join(", ")}`
        );
      },
    },
    {
      id: "mover-still-standing",
      description: "the mover is still on their feet",
      assert(observed) {
        const player = playerIn(observed, "team1:0");
        checkpointAssert(
          player.status === PlayerStatus.ACTIVE,
          `the mover should still be standing, but is ${player.status}`
        );
      },
    },
  ],
};

export const MOVEMENT_CASES: ScenarioCase[] = [unopposedMove];
