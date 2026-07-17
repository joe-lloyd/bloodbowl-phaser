/**
 * Rule scenarios — Passing skills (Pass, Sure Hands).
 * Assertions migrated from skill-rerolls.test.ts.
 */

import { SkillType } from "../../types/Skills";
import {
  RuleScenarioEntry,
  playSetup,
  skillRerollConfig,
} from "../../game/rules-lab";

export const PASSING_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.PASS,
    configs: [
      skillRerollConfig({
        id: "pass-reroll",
        name: "Throw a short pass",
        description: "A failed pass offers the Pass skill re-roll",
        skill: SkillType.PASS,
        rollKind: "pass",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.PASS] },
            { playerIndex: 1, x: 7, y: 5 }, // catcher
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
  {
    skill: SkillType.SURE_HANDS,
    configs: [
      skillRerollConfig({
        id: "sure-hands-reroll",
        name: "Pick up the loose ball",
        description: "A failed pick-up offers the Sure Hands re-roll",
        skill: SkillType.SURE_HANDS,
        rollKind: "pickup",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.SURE_HANDS] },
          ],
          team2Placements: [{ playerIndex: 0, x: 20, y: 9 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 5, y: 5 }] },
        ],
      }),
    ],
  },
];
