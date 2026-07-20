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
  playerStanding,
  playerDown,
  playerAt,
  turnoverHappened,
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
    skill: SkillType.ARM_BAR,
    configs: [
      {
        id: "arm-bar-failed-dodge",
        name: "Arm Bar on a failed dodge",
        description: "A marker adds +1 armour/injury when the dodger falls",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 16, y: 4 }],
          team2Placements: [
            { playerIndex: 0, x: 16, y: 5, skills: [SkillType.ARM_BAR] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // Dodge away from (16,4); the Arm Bar marker at (16,5) is adjacent
          // to the vacated square but not to the (15,3) landing square.
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "arm-bar-applied",
            name: "Arm Bar adds its modifier",
            matches: (r) => skillTriggered(r, SkillType.ARM_BAR),
            verify: (r) =>
              assert(
                playerDown(r, "team1:0"),
                "Arm Bar only fires when the dodger falls"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.GRAB,
    configs: [
      blockConfig({
        id: "grab-any-adjacent-square",
        name: "Grab widens the push squares",
        description: "The blocker may push into any unoccupied adjacent square",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.GRAB] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "side-squares-offered",
            name: "The squares beside the defender are offered",
            matches: (r) => skillTriggered(r, SkillType.GRAB),
            verify: (r) => {
              const push = r.decisions.find(
                (d) => d.type === "push-direction"
              ) as { options: { x: number; y: number }[] } | undefined;
              assert(!!push, "a push-direction decision must be raised");
              const opts = push!.options;
              assert(
                opts.some((o) => o.x === 11 && o.y === 4) &&
                  opts.some((o) => o.x === 11 && o.y === 6),
                "Grab must offer the squares beside the defender, not just behind"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.JUGGERNAUT,
    configs: [
      {
        id: "juggernaut-both-down-to-push",
        name: "Juggernaut turns Both Down into a Push on a Blitz",
        description: "The blitzer stays up and there is no turnover",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 7, skills: [SkillType.JUGGERNAUT] },
          ],
          team2Placements: [{ playerIndex: 0, x: 12, y: 7 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "blitz" },
          { type: "move", playerId: "team1:0", path: [{ x: 11, y: 7 }] },
          { type: "block", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        decisionPolicy: { preferBlockResult: "both-down" },
        outcomes: [
          {
            id: "converted-to-push",
            name: "Both Down becomes a push, no turnover",
            matches: (r) => skillTriggered(r, SkillType.JUGGERNAUT),
            verify: (r) => {
              assert(
                playerStanding(r, "team1:0"),
                "the blitzer must stay standing"
              );
              assert(
                !turnoverHappened(r),
                "no turnover when Both Down is treated as a push"
              );
              assert(
                !playerAt(r, "team2:0", { x: 12, y: 7 }),
                "the defender must be pushed back"
              );
            },
          },
        ],
      },
    ],
  },
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
