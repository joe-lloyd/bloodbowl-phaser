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

/**
 * Sevens D8: once per game the Veteran may re-roll the block dice when their
 * own Block would Knock them Down. The block-dice decision carries
 * `veteranRerollAvailable`, and the coach spends it with the explicit
 * `veteran-reroll-block` command, as Brawler does with its own command.
 */
const veteranRerollsBlock: ScenarioCase = {
  id: "veteran-rerolls-block-dice",
  name: "Veteran re-rolls a losing block",
  description:
    "A ST 3 Veteran Lineman blocks a ST 3 Lineman with one die. The die " +
    "reads Player Down, so the block-dice decision offers the Veteran " +
    "re-roll; spending it re-rolls the dice once.",
  capability: "decisions",
  interactions: [
    "protocol-command:block",
    "decision:block-dice",
    "protocol-command:veteran-reroll-block",
  ],
  setup: playSetup({
    team1Placements: [{ playerIndex: 0, x: 5, y: 5, veteran: true }],
    team2Placements: [{ playerIndex: 0, x: 6, y: 5 }],
    ballPosition: { x: 1, y: 1 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "block" }),
    step(
      { type: "block", attackerId: "team1:0", defenderId: "team2:0" },
      "block with the Veteran"
    ),
  ],
  decisionPolicy: {
    custom: (pending) =>
      pending.type === "block-dice" && pending.veteranRerollAvailable
        ? { type: "veteran-reroll-block", attackerId: pending.attackerId }
        : undefined,
  },
  layers: ["engine"],
  interactive: true,
  variants: [
    {
      id: "skull-rerolled-to-push",
      name: "Player Down re-rolled to Push",
      // Committed: one die reads Player Down, the re-roll reads Push (the
      // same seed as __tests__/headless/veteran-reroll.test.ts).
      seed: 8,
      expectedOutcome:
        "the Veteran re-roll is offered on Player Down and the re-roll reads Push",
    },
  ],
  checkpoints: [
    {
      id: "veteran-reroll-offered",
      description: "the first block-dice decision offers the Veteran re-roll",
      layers: ["engine"],
      assert(observed) {
        const first = observed.decisions.find(
          (decision) => decision.type === "block-dice"
        );
        checkpointAssert(
          first?.type === "block-dice" &&
            first.veteranRerollAvailable === true &&
            first.options.map((option) => option.type).join() === "skull",
          "one Player Down die must offer the Veteran re-roll"
        );
      },
    },
    {
      id: "veteran-reroll-spent",
      description: "the block dice are re-rolled once, from the Veteran",
      layers: ["engine"],
      assert(observed) {
        const used = observed.events
          .filter((event) => event.name === GameEventNames.RerollUsed)
          .map((event) => event.data as { source?: string; rollKind?: string });
        checkpointAssert(
          used.length === 1 &&
            used[0].source === "veteran" &&
            used[0].rollKind === "block",
          "exactly one Veteran block re-roll must be used"
        );
        const blockDice = observed.decisions.filter(
          (decision) => decision.type === "block-dice"
        );
        const second = blockDice[1];
        checkpointAssert(
          blockDice.length === 2 &&
            second?.type === "block-dice" &&
            second.veteranRerollAvailable === false &&
            second.options.map((option) => option.type).join() === "push",
          "the re-rolled die must read Push with no second Veteran offer"
        );
        checkpointAssert(
          observed.snapshot.veteranRerollsUsed?.length === 1,
          "the Veteran's once-per-game re-roll must be recorded as used"
        );
      },
    },
  ],
};

export const REROLL_DECISION_CASES: ScenarioCase[] = [
  exhaustedRerolls,
  veteranRerollsBlock,
];
