/**
 * Rule scenarios — Strength skills (Break Tackle).
 */

import { SkillType } from "../../types/Skills";
import { PlayerStatus } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
  ScriptResult,
  playSetup,
  blockConfig,
  assert,
  sawEvent,
  skillTriggered,
  skillCheckDiff,
  playerOf,
  blockDiceCount,
} from "../../game/rules-lab";

const mbTriggered = (effectPart: string) => (r: ScriptResult) =>
  sawEvent(
    r,
    GameEventNames.SkillTriggered,
    (d) =>
      (d as { skill: string }).skill === SkillType.MIGHTY_BLOW &&
      (d as { effect: string }).effect.includes(effectPart)
  );


export const STRENGTH_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.GUARD,
    configs: [
      blockConfig({
        id: "guard-marked-assist",
        name: "Guard assists while marked",
        description:
          "A marked assister with Guard still supports the block (2 dice)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5 }, // attacker
            { playerIndex: 1, x: 11, y: 6, skills: [SkillType.GUARD] }, // assister
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5 }, // defender
            { playerIndex: 1, x: 10, y: 7 }, // marks the assister only
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "assist-counts",
            name: "The Guard assist yields a second die",
            matches: (r) => blockDiceCount(r) === 2,
            verify: (r) =>
              assert(
                blockDiceCount(r) === 2,
                "Guard's marked assist must give the attacker 2 block dice"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.MIGHTY_BLOW,
    configs: [
      blockConfig({
        id: "mighty-blow-pow",
        name: "POW with Mighty Blow",
        description: "+1 to the armour roll (or saved for the injury)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.MIGHTY_BLOW] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        outcomes: [
          {
            id: "armour-flipped",
            name: "The +1 breaks the armour",
            matches: mbTriggered("+1 to the armour"),
            verify: (r) =>
              assert(
                sawEvent(
                  r,
                  GameEventNames.DiceRoll,
                  (d) =>
                    !!(d as { rollType?: string }).rollType?.startsWith(
                      "Injury Roll"
                    )
                ),
                "the flipped armour must lead to an injury roll"
              ),
          },
          {
            id: "saved-for-injury",
            name: "The +1 goes to the injury roll",
            matches: mbTriggered("saved for the injury"),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.THICK_SKULL,
    configs: [
      blockConfig({
        id: "thick-skull-eight",
        name: "Injury 8 with Thick Skull",
        description: "An 8 is only Stunned, never a KO",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.THICK_SKULL],
              stats: { AV: 5 }, // break armour often to reach injuries
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        outcomes: [
          {
            id: "eight-is-stunned",
            name: "KO on 8 downgraded to Stunned",
            matches: (r) => skillTriggered(r, SkillType.THICK_SKULL),
            verify: (r) => {
              assert(
                sawEvent(r, GameEventNames.UI_Notification, (d) => d === "STUNNED!"),
                "the 8 must resolve as Stunned"
              );
              assert(
                playerOf(r, "team2:0").status !== PlayerStatus.KO,
                "the defender must never be KO'd on an 8"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.BREAK_TACKLE,
    configs: [
      {
        id: "break-tackle-st5",
        name: "ST 5 dodger with Break Tackle",
        description: "+3 to the first dodge of the turn",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 16,
              y: 4,
              skills: [SkillType.BREAK_TACKLE],
              stats: { ST: 5 },
            },
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
            id: "plus-three-applied",
            name: "+3 on the dodge roll",
            matches: (r) =>
              skillTriggered(r, SkillType.BREAK_TACKLE) &&
              skillCheckDiff(r, "Dodge") === 3,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Dodge") === 3,
                "dodge total must be roll + 3 for ST 5"
              ),
          },
        ],
      },
      {
        id: "break-tackle-st3",
        name: "ST 3 dodger with Break Tackle",
        description: "No bonus below ST 4 — the skill stays silent",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.BREAK_TACKLE] },
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
            id: "no-bonus",
            name: "Dodge unmodified at ST 3",
            matches: (r) => skillCheckDiff(r, "Dodge") === 0,
            verify: (r) =>
              assert(
                !skillTriggered(r, SkillType.BREAK_TACKLE),
                "Break Tackle must not trigger below ST 4"
              ),
          },
        ],
      },
    ],
  },
];
