/**
 * Rule scenarios — General skills (Block, Wrestle, Stand Firm, Tackle).
 * Assertions migrated from skill-block.test.ts / skill-triggers.test.ts.
 */

import { SkillType } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
  ScriptResult,
  playSetup,
  blockConfig,
  assert,
  skillTriggered,
  reactionOffered,
  turnoverHappened,
  playerStanding,
  playerDown,
  playerAt,
  playerOf,
  armourRolls,
  blockDiceCount,
} from "../../game/rules-lab";

/** How many block-dice rolls happened (a Brawler re-roll adds a second). */
const blockRollCount = (r: ScriptResult): number =>
  r.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType?: string }).rollType === "Block Roll"
  ).length;

/** Attacker team1:0 at (10,5) faces defender team2:0 at (11,5). */
const faceOff = (
  attackerSkills: SkillType[],
  defenderSkills: SkillType[]
) =>
  playSetup({
    team1Placements: [{ playerIndex: 0, x: 10, y: 5, skills: attackerSkills }],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5, skills: defenderSkills }],
    ballPosition: { x: 1, y: 1 },
  });

export const GENERAL_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.DAUNTLESS,
    configs: [
      blockConfig({
        id: "dauntless-matches-strength",
        name: "Dauntless vs a stronger foe",
        description:
          "A D6 + own ST beating the target's ST matches it (even block, 1 die)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.DAUNTLESS] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 4 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "strength-matched",
            name: "Strength matched — a single even die",
            matches: (r) =>
              skillTriggered(r, SkillType.DAUNTLESS) &&
              blockDiceCount(r) === 1,
            verify: (r) =>
              assert(
                blockDiceCount(r) === 1,
                "matching ST 4 makes the ST-3 blocker even (1 die)"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.FEND,
    configs: [
      blockConfig({
        id: "fend-denies-follow-up",
        name: "Fend denies the follow-up",
        description: "A pushed Fend player stops the blocker following up",
        setup: faceOff([], [SkillType.FEND]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "no-follow-up",
            name: "The blocker stays put",
            matches: (r) => skillTriggered(r, SkillType.FEND),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 10, y: 5 }),
                "the blocker must not follow up"
              );
              assert(
                !playerAt(r, "team2:0", { x: 11, y: 5 }),
                "the defender must be pushed back"
              );
              assert(
                !r.decisions.some((d) => d.type === "follow-up"),
                "no follow-up decision may be offered"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.STRIP_BALL,
    configs: [
      blockConfig({
        id: "strip-ball-drops-ball",
        name: "Strip Ball knocks the ball loose",
        description: "A pushed ball carrier drops the ball, which bounces",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.STRIP_BALL] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 11, y: 5 }, // the defender is holding it
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "ball-dropped",
            name: "The carrier no longer holds the ball",
            matches: (r) => skillTriggered(r, SkillType.STRIP_BALL),
            verify: (r) => {
              const defender = playerOf(r, "team2:0");
              const ball = r.snapshot.ballPosition;
              assert(
                !!ball &&
                  !!defender.gridPosition &&
                  (ball.x !== defender.gridPosition.x ||
                    ball.y !== defender.gridPosition.y),
                "the ball must have bounced off the pushed carrier"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.BRAWLER,
    configs: [
      blockConfig({
        id: "brawler-rerolls-both-down",
        name: "Brawler re-rolls a Both Down",
        description: "A single Both Down die is re-rolled once",
        setup: faceOff([SkillType.BRAWLER], []), // ST 3 v 3 → one die
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "both-down-rerolled",
            name: "The Both Down die is re-rolled",
            matches: (r) => skillTriggered(r, SkillType.BRAWLER),
            verify: (r) =>
              assert(
                blockRollCount(r) === 2,
                "Brawler must roll a second block die"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.BLOCK,
    configs: [
      blockConfig({
        id: "block-attacker-both-down",
        name: "Attacker has Block",
        description: "Both Down knocks only the defender down — no turnover",
        setup: faceOff([SkillType.BLOCK], []),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "attacker-saved",
            name: "Attacker stays up on Both Down",
            matches: (r) =>
              skillTriggered(r, SkillType.BLOCK) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(playerDown(r, "team2:0"), "defender must still go down");
              assert(
                !turnoverHappened(r),
                "no turnover when Block saves the attacker"
              );
            },
          },
        ],
      }),
      blockConfig({
        id: "block-both-have-block",
        name: "Both players have Block",
        description: "Both Down knocks nobody down",
        setup: faceOff([SkillType.BLOCK], [SkillType.BLOCK]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "neither-falls",
            name: "Neither player falls",
            matches: (r) =>
              skillTriggered(r, SkillType.BLOCK) &&
              playerStanding(r, "team1:0") &&
              playerStanding(r, "team2:0"),
            verify: (r) =>
              assert(!turnoverHappened(r), "no turnover when nobody falls"),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.WRESTLE,
    configs: [
      blockConfig({
        id: "wrestle-accepted",
        name: "Defender uses Wrestle",
        description:
          "Both Down: both placed prone, no armour, overrides Block, no turnover",
        setup: faceOff([SkillType.BLOCK], [SkillType.WRESTLE]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "both-prone-no-armour",
            name: "Both placed prone without armour rolls",
            matches: (r) =>
              reactionOffered(r, {
                skill: SkillType.WRESTLE,
                chooser: "team2",
              }) && skillTriggered(r, SkillType.WRESTLE),
            verify: (r) => {
              assert(
                playerDown(r, "team1:0"),
                "Wrestle overrides Block — attacker goes prone"
              );
              assert(playerDown(r, "team2:0"), "defender goes prone");
              assert(armourRolls(r) === 0, "placed prone: no armour rolls");
              assert(
                !turnoverHappened(r),
                "placed prone without the ball: no turnover"
              );
            },
          },
        ],
      }),
      blockConfig({
        id: "wrestle-declined",
        name: "Wrestle declined",
        description: "Declining applies the normal Both Down",
        setup: faceOff([], [SkillType.WRESTLE]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        decisionPolicy: { acceptReactions: false },
        outcomes: [
          {
            id: "normal-both-down",
            name: "Normal Both Down applies",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.WRESTLE }) &&
              !skillTriggered(r, SkillType.WRESTLE),
            verify: (r) => {
              assert(playerDown(r, "team1:0"), "attacker knocked down");
              assert(playerDown(r, "team2:0"), "defender knocked down");
              assert(turnoverHappened(r), "attacker down = turnover");
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.STAND_FIRM,
    configs: [
      blockConfig({
        id: "stand-firm-accepted",
        name: "Stand Firm refuses the push",
        description: "The pushed player stays put; the reacting team decides",
        setup: faceOff([], [SkillType.STAND_FIRM]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "push-refused",
            name: "Push refused, defender unmoved",
            matches: (r) =>
              reactionOffered(r, {
                skill: SkillType.STAND_FIRM,
                chooser: "team2",
              }) && skillTriggered(r, SkillType.STAND_FIRM),
            verify: (r) => {
              assert(
                playerAt(r, "team2:0", { x: 11, y: 5 }),
                "defender must not move"
              );
              assert(playerStanding(r, "team2:0"), "a push never floors");
            },
          },
        ],
      }),
      blockConfig({
        id: "stand-firm-declined",
        name: "Stand Firm declined",
        description: "Declining lets the push proceed normally",
        setup: faceOff([], [SkillType.STAND_FIRM]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        decisionPolicy: { acceptReactions: false },
        outcomes: [
          {
            id: "push-proceeds",
            name: "Defender pushed back",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.STAND_FIRM }) &&
              !skillTriggered(r, SkillType.STAND_FIRM),
            verify: (r) =>
              assert(
                !playerAt(r, "team2:0", { x: 11, y: 5 }),
                "defender must have left the square"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.TACKLE,
    configs: [
      {
        id: "tackle-denies-dodge-reroll",
        name: "Tackle denies the Dodge re-roll",
        description:
          "Dodging out of a Tackle marker's zone: no Dodge skill re-roll",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.DODGE] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 16, y: 5, skills: [SkillType.TACKLE] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "dodge-skill-denied",
            name: "Failed dodge gets no re-roll offer",
            matches: (r) =>
              skillTriggered(r, SkillType.TACKLE) && playerDown(r, "team1:0"),
            verify: (r) =>
              assert(
                r.decisions.length === 0,
                "no reroll decision may be offered"
              ),
          },
        ],
      },
      blockConfig({
        id: "tackle-cancels-stumble",
        name: "Tackle vs Defender Stumbles",
        description: "The defender does not count as having Dodge — floored",
        setup: faceOff([SkillType.TACKLE], [SkillType.DODGE]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow-dodge",
        outcomes: [
          {
            id: "defender-floored",
            name: "Stumble knocks the dodger down anyway",
            matches: (r) =>
              r.decisions.some(
                (d) =>
                  d.type === "push-direction" && d.resultType === "pow-dodge"
              ) && !skillTriggered(r, SkillType.DODGE),
            verify: (r) =>
              assert(
                playerDown(r, "team2:0"),
                "Tackle cancels the Dodge conversion"
              ),
          },
        ],
      }),
    ],
  },
];
