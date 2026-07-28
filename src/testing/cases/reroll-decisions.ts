/**
 * Re-roll decision scenario cases, mirroring `__tests__/headless/reroll-decisions.test.ts`.
 */

import { GameEventNames } from "../../types/events";
import { ScenarioCase, step } from "../scenarioCase/types";
import { playSetup, checkpointAssert } from "./helpers";

/**
 * A failed roll offers a Team Re-roll only when the team has one. With an
 * empty bank the failure stands and no decision is raised.
 */
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

export const REROLL_DECISION_CASES: ScenarioCase[] = [exhaustedRerolls];
