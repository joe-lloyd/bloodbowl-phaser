import { fixtureValue } from "../fixtureValue";
import { GameEventNames } from "../../types/events";
import { RosterName, TeamSpecialRule } from "../../types/Team";
import { PlayerStatus } from "../../types/Player";
import {
  type ScenarioCase,
  type ObservedRun,
  step,
} from "../scenarioCase/types";
import { playSetup, checkpointAssert } from "./helpers";

function rolls(observed: ObservedRun, type: (rollType: string) => boolean) {
  return observed.events
    .filter((event) => event.name === GameEventNames.DiceRoll)
    .map((event) => event.data as { rollType: string; total: number })
    .filter((roll) => type(roll.rollType))
    .map((roll) => roll.total);
}

function rerollsLeft(observed: ObservedRun): number | undefined {
  return observed.snapshot.teams[0]?.rerolls;
}

const teamCaptainReroll: ScenarioCase = {
  id: "team-captain-free-reroll",
  name: "Team Captain makes a Team Re-roll free",
  description:
    "A Human Lineman fails a pick-up beside the Captain and uses the team's " +
    "only Team Re-roll. The Captain's D6 keeps the re-roll on a natural 6.",
  capability: "decisions",
  interactions: ["protocol-command:move", "decision:reroll"],
  setup: playSetup({
    team1Roster: RosterName.HUMAN,
    team2Roster: RosterName.HUMAN,
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 },
      { playerIndex: 1, x: 8, y: 8, teamCaptain: true },
    ],
    team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
    ballPosition: { x: 5, y: 5 },
    teamRerolls: { team1: 1 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:0", action: "move" }),
    step(
      { type: "move", playerId: "team1:0", path: [{ x: 5, y: 5 }] },
      "step onto the ball"
    ),
  ],
  decisionPolicy: { acceptRerolls: "team" },
  layers: ["engine"],
  interactive: true,
  variants: [
    {
      id: "captain-rolls-six",
      name: "The Captain rolls a 6",

      seed: 9,
      expectedOutcome:
        "the pick-up fails, the Team Re-roll is used and the Captain's 6 keeps it",
      checkpoints: [
        {
          id: "reroll-kept",
          description:
            "the Captain rolls a 6 and the team still has its re-roll",
          assert(observed) {
            checkpointAssert(
              rolls(observed, (type) => type === "Team Captain").join() === "6",
              "the Captain must roll a single 6"
            );
            checkpointAssert(
              rerollsLeft(observed) === 1,
              "a free Team Re-roll must stay in the bank"
            );
          },
        },
      ],
    },
    {
      id: "captain-misses",
      name: "The Captain misses the 6",

      seed: 7,
      expectedOutcome:
        "the pick-up fails, the Team Re-roll is used and the Captain's roll spends it",
      checkpoints: [
        {
          id: "reroll-spent",
          description: "the Captain rolls 1 to 5 and the re-roll is spent",
          assert(observed) {
            const captain = rolls(observed, (type) => type === "Team Captain");
            checkpointAssert(
              captain.length === 1 && fixtureValue(captain[0]) < 6,
              "the Captain must roll once, below 6"
            );
            checkpointAssert(
              rerollsLeft(observed) === 0,
              "the Team Re-roll must be spent"
            );
          },
        },
      ],
    },
  ],
  checkpoints: [
    {
      id: "team-reroll-used",
      description: "the failed pick-up is re-rolled with the Team Re-roll",
      assert(observed) {
        const used = observed.events
          .filter((event) => event.name === GameEventNames.RerollUsed)
          .map((event) => event.data as { source?: string });
        checkpointAssert(
          used.length === 1 && fixtureValue(used[0]).source === "team",
          "exactly one Team Re-roll must be used"
        );
      },
    },
  ],
};

const briberyArgueReroll: ScenarioCase = {
  id: "bribery-and-corruption-argue-reroll",
  name: "Bribery and Corruption re-rolls Argue the Call",
  description:
    "A Goblin Lineman is spotted fouling a Prone Human, and the Argue the " +
    "Call roll is a 1. Bribery and Corruption re-rolls it once per game.",
  capability: "fouling",
  interactions: ["protocol-command:foul"],
  setup: playSetup({
    team1Roster: RosterName.GOBLIN,
    team2Roster: RosterName.HUMAN,
    team1Placements: [{ playerIndex: 1, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    ballPosition: { x: 1, y: 1 },
  }),
  steps: [
    step({ type: "declare-action", playerId: "team1:1", action: "foul" }),
    step(
      { type: "foul", playerId: "team1:1", x: 11, y: 5 },
      "foul the Prone Human"
    ),
  ],
  layers: ["engine"],
  interactive: true,
  variants: [
    {
      id: "argue-one-rerolled",
      name: "A 1 to Argue the Call is re-rolled",

      seed: 5,
      expectedOutcome:
        "the foul is spotted, the Argue the Call 1 is re-rolled once",
    },
  ],
  checkpoints: [
    {
      id: "argue-rerolled",
      description: "the first Argue the Call roll is a 1 and is re-rolled",
      assert(observed) {
        const argued = rolls(observed, (type) =>
          type.startsWith("Argue the Call")
        );
        checkpointAssert(
          argued.length === 2 && argued[0] === 1,
          "a 1 must be followed by exactly one re-roll"
        );
        checkpointAssert(
          observed.events.some(
            (event) =>
              event.name === GameEventNames.SkillTriggered &&
              (event.data as { skill?: string }).skill ===
                TeamSpecialRule.BRIBERY_AND_CORRUPTION
          ),
          "Bribery and Corruption must be announced"
        );
        checkpointAssert(
          observed.snapshot.briberyRerollsUsed?.join() === "team1",
          "the once-per-game re-roll must be recorded as used"
        );
      },
    },
  ],
};

export const TEAM_SPECIAL_RULE_CASES: ScenarioCase[] = [
  teamCaptainReroll,
  briberyArgueReroll,
];
