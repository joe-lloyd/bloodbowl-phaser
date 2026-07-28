/**
 * General decision-handling scenario cases: the protocol's rule that a
 * decision reply is only meaningful while that decision is pending.
 *
 * No `__tests__/headless/*.test.ts` file owns "decisions" generally — the
 * closest named file, `reroll-decisions.test.ts`, is specific to re-rolls
 * (see `reroll-decisions.ts` for that), so this is its own section home
 * (see docs/E2E_TESTING.md's case-organization note).
 */

import { ScenarioCase, step } from "../scenarioCase/types";
import { playSetup, stepRejected, checkpointAssert } from "./helpers";

const openField = () =>
  playSetup({
    team1Placements: [
      { playerIndex: 0, x: 5, y: 5 },
      { playerIndex: 1, x: 2, y: 2 },
    ],
    team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
    ballPosition: { x: 1, y: 1 },
  });

/**
 * Decision replies are only accepted while that decision is pending; a stale
 * reply is refused rather than silently applied.
 */
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

export const DECISION_CASES: ScenarioCase[] = [staleDecisionReply];
