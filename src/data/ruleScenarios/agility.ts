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
  playerAt,
  sawEvent,
  blockDiceCount,
} from "../../game/rules-lab";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";

/** Straight path of `steps` squares heading right from (fromX, y). */
const straightPath = (fromX: number, y: number, steps: number) =>
  Array.from({ length: steps }, (_, i) => ({ x: fromX + 1 + i, y }));

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
    skill: SkillType.SURE_FEET,
    configs: [
      skillRerollConfig({
        id: "sure-feet-rush",
        name: "Rush one square past MA",
        description: "A failed Rush offers the Sure Feet re-roll",
        skill: SkillType.SURE_FEET,
        rollKind: "rush",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 2, y: 5, skills: [SkillType.SURE_FEET] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // MA 6 + 1 rush = 7 squares
          { type: "move", playerId: "team1:0", path: straightPath(2, 5, 7) },
        ],
      }),
    ],
  },
  {
    skill: SkillType.SPRINT,
    configs: [
      {
        id: "sprint-three-rushes",
        name: "Move MA + 3 with Sprint",
        description: "A third Rush is allowed (nine squares on MA 6)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 2, y: 5, skills: [SkillType.SPRINT] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // MA 6 + 3 rushes = 9 squares — rejected without Sprint
          { type: "move", playerId: "team1:0", path: straightPath(2, 5, 9) },
        ],
        outcomes: [
          {
            id: "nine-squares-moved",
            name: "All three rushes taken",
            matches: (r) =>
              r.responses.every((resp) => resp.ok) &&
              playerAt(r, "team1:0", { x: 11, y: 5 }),
            verify: (r) =>
              assert(
                playerAt(r, "team1:0", { x: 11, y: 5 }),
                "player must reach MA+3 squares"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.JUMP_UP,
    configs: [
      {
        id: "jump-up-free-stand",
        name: "Prone player stands for free",
        description: "Standing up costs no movement with Jump Up",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 5,
              y: 5,
              status: PlayerStatus.PRONE,
              skills: [SkillType.JUMP_UP],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 6, y: 5 }] },
        ],
        outcomes: [
          {
            id: "stood-up-free",
            name: "Stand-up cost is zero",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.PlayerStoodUp,
                (d) => (d as { cost: number }).cost === 0
              ),
            verify: (r) => {
              const mover = r.snapshot.teams[0].players[0];
              assert(
                mover.movementUsed === 1,
                "one square moved must cost exactly 1 movement"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.DEFENSIVE,
    configs: [
      blockConfig({
        id: "defensive-cancels-guard",
        name: "Defensive cancels an enemy Guard",
        description:
          "On the assister's Turn, a Defensive marker denies their Guard (back to 1 die)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5 }, // attacker
            { playerIndex: 1, x: 11, y: 6, skills: [SkillType.GUARD] }, // Guard assister
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5 }, // defender
            { playerIndex: 1, x: 10, y: 7, skills: [SkillType.DEFENSIVE] }, // Defensive marker
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "guard-denied",
            name: "Guard denied — no extra die",
            matches: (r) => blockDiceCount(r) === 1,
            verify: (r) =>
              assert(
                blockDiceCount(r) === 1,
                "Defensive must cancel the Guard assist, leaving a single die"
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
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
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
