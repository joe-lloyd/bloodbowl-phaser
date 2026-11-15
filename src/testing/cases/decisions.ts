/**
 * General decision-handling scenario cases: the protocol's rule that a
 * decision reply is only meaningful while that decision is pending.
 *
 * No `__tests__/headless/*.test.ts` file owns "decisions" generally — the
 * closest named file, `reroll-decisions.test.ts`, is specific to re-rolls
 * (see `reroll-decisions.ts` for that), so this is its own section home
 * (see docs/E2E_TESTING.md's case-organization note).
 */

import { ObservedRun, ScenarioCase, step } from "../scenarioCase/types";
import { playSetup, stepRejected, checkpointAssert, playerIn } from "./helpers";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { RosterName } from "../../types/Team";

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

const turnedOver = (observed: ObservedRun) =>
  observed.events.some((event) => event.name === GameEventNames.Turnover);

/**
 * A Bribe for a spotted fouler (2025 rulebook p.148): the Argue the Call
 * roll fails, the coach uses the Bribe Get the Ref left them, and the
 * Bribe roll decides whether the fouler stays.
 */
const bribeForFouler: ScenarioCase = {
  id: "bribe-for-sent-off-fouler",
  name: "A Bribe for a Sent-off fouler",
  description:
    "A Human Lineman holding a Bribe is spotted fouling a Prone Orc and " +
    "loses the argument. The coach uses the Bribe: a 2+ keeps them on.",
  capability: "fouling",
  interactions: ["protocol-command:foul", "protocol-command:use-reaction"],
  setup: playSetup({
    team1Roster: RosterName.HUMAN,
    team2Roster: RosterName.ORC,
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    ballPosition: { x: 1, y: 1 },
    bribes: { team1: 1 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "foul" }),
    step(
      { type: "foul", playerId: "team1:0", x: 11, y: 5 },
      "foul the Prone Orc"
    ),
    step({ type: "use-reaction", accept: true }, "use the Bribe"),
  ],
  layers: ["engine"],
  interactive: true,
  variants: [
    {
      id: "bribe-works",
      name: "The Bribe works",
      seed: 5,
      expectedOutcome: "the argument fails, the Bribe rolls a 4: no Sent-off",
      checkpoints: [
        {
          id: "fouler-stays",
          description: "the fouler stays, with no Turnover",
          assert(observed) {
            checkpointAssert(
              playerIn(observed, "team1:0").status === PlayerStatus.ACTIVE,
              "a Bribe that works keeps the fouler on the pitch"
            );
            checkpointAssert(
              !turnedOver(observed),
              "a Bribe that works causes no Turnover"
            );
          },
        },
      ],
    },
    {
      id: "bribe-pocketed",
      name: "The referee pockets the Bribe",
      seed: 51,
      expectedOutcome: "the argument fails, the Bribe rolls a 1: Sent-off",
      checkpoints: [
        {
          id: "fouler-sent-off",
          description: "the fouler is Sent-off, a Turnover",
          assert(observed) {
            checkpointAssert(
              playerIn(observed, "team1:0").status === PlayerStatus.REMOVED,
              "a pocketed Bribe still Sends-off the fouler"
            );
            checkpointAssert(turnedOver(observed), "the Sent-off is a Turnover");
          },
        },
      ],
    },
  ],
  checkpoints: [
    {
      id: "bribe-spent",
      description: "the argument failed and the Bribe was rolled",
      assert(observed) {
        const steps = observed.events
          .filter((event) => event.name === GameEventNames.RefereeCall)
          .map((event) => (event.data as { step: string }).step);
        checkpointAssert(
          steps.join() === "called,argued,bribed,outcome",
          `the card must hear every step, heard ${steps.join()}`
        );
        checkpointAssert(
          observed.snapshot.bribes?.team1 === 0,
          "the Bribe must be spent"
        );
      },
    },
  ],
};

export const DECISION_CASES: ScenarioCase[] = [
  staleDecisionReply,
  bribeForFouler,
];
