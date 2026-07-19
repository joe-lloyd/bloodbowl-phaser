/**
 * Rule scenarios — Mutation skills (Two Heads, Big Hand, Extra Arms).
 */

import { SkillType } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
  playSetup,
  blockConfig,
  assert,
  sawEvent,
  skillTriggered,
  skillCheckDiff,
  blockDiceCount,
} from "../../game/rules-lab";

const injuryRolled = (r: Parameters<typeof skillTriggered>[0]) =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) => !!(d as { rollType?: string }).rollType?.startsWith("Injury Roll")
  );

export const MUTATION_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.HORNS,
    configs: [
      {
        id: "horns-blitz-strength",
        name: "Horns on a Blitz block",
        description: "+1 Strength on the Blitz block yields a second die",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 7, skills: [SkillType.HORNS] },
          ],
          team2Placements: [{ playerIndex: 0, x: 12, y: 7 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "blitz" },
          { type: "move", playerId: "team1:0", path: [{ x: 11, y: 7 }] },
          { type: "block", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        decisionPolicy: { preferBlockResult: "push" },
        outcomes: [
          {
            id: "second-die",
            name: "Blitz block rolls 2 dice",
            matches: (r) =>
              skillTriggered(r, SkillType.HORNS) && blockDiceCount(r) === 2,
            verify: (r) =>
              assert(
                blockDiceCount(r) === 2,
                "Horns' +1 ST gives the ST-3 blitzer 2 dice vs ST 3"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.FOUL_APPEARANCE,
    configs: [
      blockConfig({
        id: "foul-appearance-cancels-block",
        name: "Foul Appearance cancels a block",
        description:
          "A 1 on the pre-block D6 cancels the block and ends the activation",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.FOUL_APPEARANCE],
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "block-cancelled",
            name: "The block never rolls",
            matches: (r) => skillTriggered(r, SkillType.FOUL_APPEARANCE),
            verify: (r) => {
              assert(
                blockDiceCount(r) === undefined,
                "no block dice are rolled when Foul Appearance cancels"
              );
              assert(
                sawEvent(r, GameEventNames.UI_BlockRollCancelled),
                "the block must be cancelled"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.CLAWS,
    configs: [
      blockConfig({
        id: "claws-high-av",
        name: "POW vs AV 10 with Claws",
        description: "A natural 8+ breaks armour regardless of AV",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.CLAWS] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, stats: { AV: 10 } },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        outcomes: [
          {
            id: "claws-break",
            name: "8 or 9 breaks the AV 10 armour",
            matches: (r) => skillTriggered(r, SkillType.CLAWS),
            verify: (r) =>
              assert(injuryRolled(r), "the forced break must reach injury"),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.IRON_HARD_SKIN,
    configs: [
      blockConfig({
        id: "iron-hard-skin-vs-mighty-blow",
        name: "Mighty Blow vs Iron Hard Skin",
        description: "Armour modifiers are cancelled against this player",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.MIGHTY_BLOW] },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.IRON_HARD_SKIN],
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        outcomes: [
          {
            id: "modifier-cancelled",
            name: "Mighty Blow's armour bonus is cancelled",
            matches: (r) => skillTriggered(r, SkillType.IRON_HARD_SKIN),
            verify: (r) =>
              assert(
                !injuryRolled(r),
                "the cancelled modifier means the armour holds"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.TWO_HEADS,
    configs: [
      {
        id: "two-heads-dodge",
        name: "Dodge with Two Heads",
        description: "+1 to the dodge Agility Test",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.TWO_HEADS] },
          ],
          team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "plus-one-applied",
            name: "+1 on the dodge roll",
            matches: (r) =>
              skillTriggered(r, SkillType.TWO_HEADS) &&
              skillCheckDiff(r, "Dodge") === 1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Dodge") === 1,
                "dodge total must be roll + 1"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.BIG_HAND,
    configs: [
      {
        id: "big-hand-marked-pickup",
        name: "Marked pick-up with Big Hand",
        description: "Ignores the marking modifier on the pick-up",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.BIG_HAND] },
          ],
          team2Placements: [{ playerIndex: 0, x: 6, y: 5 }], // marks (5,5)
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 5, y: 5 }] },
        ],
        outcomes: [
          {
            id: "marking-ignored",
            name: "Pick-up keeps its +1 despite the marker",
            matches: (r) =>
              skillTriggered(r, SkillType.BIG_HAND) &&
              skillCheckDiff(r, "Pickup") === 1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Pickup") === 1,
                "net modifier must be +1 (base +1, marker cancelled)"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.EXTRA_ARMS,
    configs: [
      {
        id: "extra-arms-pickup",
        name: "Pick-up with Extra Arms",
        description: "+1 to the pick-up Agility Test",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.EXTRA_ARMS] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 5, y: 5 }] },
        ],
        outcomes: [
          {
            id: "plus-one-applied",
            name: "+2 net on the pick-up (base +1, Extra Arms +1)",
            matches: (r) =>
              skillTriggered(r, SkillType.EXTRA_ARMS) &&
              skillCheckDiff(r, "Pickup") === 2,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Pickup") === 2,
                "net modifier must be +2"
              ),
          },
        ],
      },
    ],
  },
];
