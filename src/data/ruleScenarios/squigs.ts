import { RosterName } from "../../types/Team";
import { SkillType } from "../../types/Skills";
import {
  type RuleScenarioEntry,
  playSetup,
  skillCheckDiff,
  skillTriggered,
} from "../../game/rules-lab";

const wrangler = { playerIndex: 1, x: 10, y: 5 };
const setup = playSetup({
  team1Roster: RosterName.NIGHT_GOBLIN,
  team1Placements: [wrangler, { playerIndex: 3, x: 3, y: 3 }],
  team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
  ballPosition: { x: 5, y: 5 },
});

export const SQUIG_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.SQUIG_RAGE,
    configs: [
      {
        id: "squig-rage-activation",
        name: "Squig Rage roll on activation",
        description:
          "An isolated Wrangler rolls before an action is chosen: on a 3+ the coach picks one, on a 1 or 2 it becomes Distracted.",
        setup,
        script: [{ type: "roll-squig-rage", playerId: "team1:1" }],
        outcomes: [
          {
            id: "distracted",
            name: "The Wrangler becomes Distracted and ends the activation",
            matches: (run) =>
              skillTriggered(run, SkillType.SQUIG_RAGE) &&
              run.snapshot.activePlayer === null,
          },
          {
            id: "acts",
            name: "The Wrangler passes the roll and waits for an action",
            matches: (run) =>
              skillCheckDiff(run, SkillType.SQUIG_RAGE) === 0 &&
              run.snapshot.activePlayer?.action === null &&
              run.snapshot.activePlayer.squigRageSettled === true,
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SQUIG_RESTRAINT,
    configs: [
      {
        id: "squig-restraint-range",
        name: "Standing Herder within three squares",
        description: "The Wrangler activates without rolling for Squig Rage.",
        setup: {
          ...setup,
          team1Placements: [wrangler, { playerIndex: 2, x: 7, y: 8 }],
        },
        script: [
          {
            type: "declare-action",
            playerId: "team1:1",
            action: "ballAndChain",
          },
        ],
        outcomes: [
          {
            id: "restrained",
            name: "The Wrangler activates without a Rage roll",
            matches: (run) =>
              run.snapshot.activePlayer?.action === "ballAndChain" &&
              skillCheckDiff(run, SkillType.SQUIG_RAGE) === undefined,
          },
        ],
      },
    ],
  },
];
