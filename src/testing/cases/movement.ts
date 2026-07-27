/**
 * Movement scenario cases.
 *
 * Mirrors `__tests__/headless/*` coverage of plain movement: no dedicated
 * headless file owns "movement" by name, so this is the section's own home
 * (see docs/E2E_TESTING.md's case-organization note).
 *
 * `unopposedMove` is the first case written against the shared contract, and
 * the one the engine/browser parity check runs on: a plain walk needs no
 * dice, so the two lanes must agree exactly rather than approximately.
 */

import { ScenarioCase, step } from "../scenarioCase/types";
import {
  playSetup,
  endsAt,
  noTurnover,
  emitted,
  playerIn,
  checkpointAssert,
  stepAccepted,
} from "./helpers";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";

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

/**
 * The pitch edge is a hard boundary: a path step onto a square outside the
 * 20x11 grid is refused and the player does not move.
 */
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

export const MOVEMENT_CASES: ScenarioCase[] = [unopposedMove, offPitchMove];
