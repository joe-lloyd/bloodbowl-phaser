/**
 * Rule scenarios — Traits (No Ball).
 */

import { SkillType } from "../../types/Skills";
import { PlayerStatus } from "../../types/Player";
import {
  RuleScenarioEntry,
  playSetup,
  blockConfig,
  assert,
  skillTriggered,
  turnoverHappened,
  playerOf,
} from "../../game/rules-lab";

export const TRAIT_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.DECAY,
    configs: [
      blockConfig({
        id: "decay-casualty",
        name: "Casualty against a Decay player",
        description: "+1 to the casualty roll",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.DECAY],
              stats: { AV: 4 }, // reach casualties often
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "plus-one-casualty",
            name: "Casualty roll modified by +1",
            matches: (r) => skillTriggered(r, SkillType.DECAY),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.REGENERATION,
    configs: [
      blockConfig({
        id: "regeneration-save",
        name: "Casualty with Regeneration",
        description: "A 4+ ignores the casualty; the player goes to Reserves",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.REGENERATION],
              stats: { AV: 4 },
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "regenerated",
            name: "Casualty ignored, player in Reserves",
            matches: (r) => skillTriggered(r, SkillType.REGENERATION),
            verify: (r) => {
              const player = playerOf(r, "team2:0");
              assert(
                player.status === PlayerStatus.RESERVE,
                "the player must be in Reserves"
              );
              assert(!player.gridPosition, "and off the pitch");
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.NO_BALL,
    configs: [
      {
        id: "no-ball-pickup",
        name: "No Ball player enters the ball's square",
        description: "The pick-up automatically fails as a natural 1",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.NO_BALL] },
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
            id: "auto-fail",
            name: "Pick-up auto-fails, turnover",
            matches: (r) => skillTriggered(r, SkillType.NO_BALL),
            verify: (r) => {
              assert(turnoverHappened(r), "failed pick-up is a turnover");
              assert(
                !r.events.some(
                  (e) =>
                    e.name === "diceRoll" &&
                    (e.data as { rollType?: string })?.rollType?.startsWith(
                      "Pickup"
                    ) &&
                    (e.data as { description?: string })?.description?.includes(
                      "Target"
                    )
                ),
                "no real pick-up roll may happen"
              );
            },
          },
        ],
      },
    ],
  },
];
