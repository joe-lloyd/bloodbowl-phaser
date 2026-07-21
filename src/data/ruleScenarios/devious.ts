/**
 * Rule scenarios — Devious skills (Shadowing).
 */

import { SkillType } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
  playSetup,
  assert,
  sawEvent,
  reactionOffered,
  playerAt,
  playerStanding,
} from "../../game/rules-lab";

export const DEVIOUS_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.SHADOWING,
    configs: [
      {
        id: "shadowing-follows-dodger",
        name: "Shadowing chases the dodger",
        description:
          "A 4+ places the shadower in the vacated square after a successful dodge",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 16, y: 4 }],
          team2Placements: [
            { playerIndex: 0, x: 16, y: 5, skills: [SkillType.SHADOWING] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "follows",
            name: "The shadower ends in the vacated square",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.SHADOWING }) &&
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.SHADOWING &&
                  !!(d as { effect?: string }).effect?.includes("follows")
              ) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(
                playerAt(r, "team2:0", { x: 16, y: 4 }),
                "the shadower must occupy the vacated square"
              );
              assert(
                playerStanding(r, "team2:0"),
                "the shadower arrives Standing"
              );
              assert(
                playerAt(r, "team1:0", { x: 15, y: 3 }),
                "the dodger completes their move"
              );
            },
          },
          {
            id: "fails-to-follow",
            name: "A 1-3 leaves the shadower behind",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.SHADOWING }) &&
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.SHADOWING &&
                  !!(d as { effect?: string }).effect?.includes("fails")
              ),
            verify: (r) =>
              assert(
                playerAt(r, "team2:0", { x: 16, y: 5 }),
                "the shadower must stay where they were"
              ),
          },
        ],
      },
    ],
  },
];
