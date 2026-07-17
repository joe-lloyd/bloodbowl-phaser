/**
 * Rule scenarios — Agility skills (Dodge, Catch).
 * Assertions migrated from skill-rerolls.test.ts / skill-triggers.test.ts.
 */

import { SkillType } from "../../types/Skills";
import {
  RuleScenarioEntry,
  playSetup,
  skillRerollConfig,
  blockConfig,
  assert,
  skillTriggered,
  playerStanding,
} from "../../game/rules-lab";

export const AGILITY_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.DODGE,
    configs: [
      skillRerollConfig({
        id: "dodge-reroll",
        name: "Dodge away from a marker",
        description: "A failed dodge offers the Dodge skill re-roll",
        skill: SkillType.DODGE,
        rollKind: "dodge",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.DODGE] },
          ],
          team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
      }),
      blockConfig({
        id: "dodge-stumble-becomes-push",
        name: "Defender Stumbles vs Dodge",
        description: "Without Tackle, the stumble is treated as a push",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, skills: [SkillType.DODGE] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow-dodge",
        outcomes: [
          {
            id: "stumble-becomes-push",
            name: "Dodger pushed but not floored",
            matches: (r) =>
              r.decisions.some(
                (d) =>
                  d.type === "push-direction" && d.resultType === "pow-dodge"
              ) && skillTriggered(r, SkillType.DODGE),
            verify: (r) =>
              assert(
                playerStanding(r, "team2:0"),
                "the dodger must stay on their feet"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.CATCH,
    configs: [
      skillRerollConfig({
        id: "catch-reroll",
        name: "Catch a pass",
        description: "A dropped catch offers the Catch skill re-roll",
        skill: SkillType.CATCH,
        rollKind: "catch",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 }, // passer, holding the ball
            { playerIndex: 1, x: 7, y: 5, skills: [SkillType.CATCH] },
          ],
          team2Placements: [{ playerIndex: 0, x: 20, y: 9 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
        ],
      }),
    ],
  },
];
