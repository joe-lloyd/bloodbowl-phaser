/**
 * Rule scenarios — Passing skills (Pass, Sure Hands).
 * Assertions migrated from skill-rerolls.test.ts.
 */

import { SkillType } from "../../types/Skills";
import {
  RuleScenarioEntry,
  RuleConfig,
  playSetup,
  skillRerollConfig,
  assert,
  skillTriggered,
  skillCheckDiff,
  turnoverHappened,
} from "../../game/rules-lab";

/** Passer at (4,5) holding the ball throws to (targetX, 5). */
function passModifierConfig(opts: {
  id: string;
  name: string;
  description: string;
  skill: SkillType;
  targetX: number;
  expectedDiff: number;
  markerAt?: { x: number; y: number };
}): RuleConfig {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    setup: playSetup({
      team1Placements: [
        { playerIndex: 0, x: 4, y: 5, skills: [opts.skill] },
        { playerIndex: 1, x: opts.targetX, y: 5 }, // catcher
      ],
      team2Placements: [
        opts.markerAt
          ? { playerIndex: 0, ...opts.markerAt }
          : { playerIndex: 0, x: 18, y: 8 },
      ],
      ballPosition: { x: 4, y: 5 },
    }),
    script: [
      { type: "declare-action", playerId: "team1:0", action: "pass" },
      { type: "pass", playerId: "team1:0", x: opts.targetX, y: 5 },
    ],
    outcomes: [
      {
        id: "modifier-applied",
        name: `${opts.skill} modifier on the PA test`,
        matches: (r) =>
          skillTriggered(r, opts.skill) &&
          skillCheckDiff(r, "Pass") === opts.expectedDiff,
        verify: (r) =>
          assert(
            skillCheckDiff(r, "Pass") === opts.expectedDiff,
            `net pass modifier must be ${opts.expectedDiff}`
          ),
      },
    ],
  };
}

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
  {
    skill: SkillType.ACCURATE,
    configs: [
      passModifierConfig({
        id: "accurate-quick-pass",
        name: "Quick Pass with Accurate",
        description: "+1 to the PA test on a Quick Pass",
        skill: SkillType.ACCURATE,
        targetX: 7, // distance 3 = Quick Pass (base 0) → net +1
        expectedDiff: 1,
      }),
    ],
  },
  {
    skill: SkillType.CANNONEER,
    configs: [
      passModifierConfig({
        id: "cannoneer-long-pass",
        name: "Long Pass with Cannoneer",
        description: "+1 to the PA test on a Long Pass",
        skill: SkillType.CANNONEER,
        targetX: 12, // distance 8 = Long Pass (base -2) → net -1
        expectedDiff: -1,
      }),
    ],
  },
  {
    skill: SkillType.NERVES_OF_STEEL,
    configs: [
      passModifierConfig({
        id: "nerves-of-steel-marked-pass",
        name: "Marked Quick Pass with Nerves of Steel",
        description: "The marking modifier is ignored on the pass",
        skill: SkillType.NERVES_OF_STEEL,
        targetX: 7,
        markerAt: { x: 5, y: 6 }, // marks the passer at (4,5)... adjacent
        expectedDiff: 0, // base 0, marker −1, NoS +1
      }),
    ],
  },
  {
    skill: SkillType.SAFE_PASS,
    configs: [
      {
        id: "safe-pass-natural-one",
        name: "Natural 1 with Safe Pass",
        description: "No fumble: ball held, activation ends, no turnover",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.SAFE_PASS] },
            { playerIndex: 1, x: 7, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
        ],
        decisionPolicy: { acceptRerolls: false }, // keep the natural 1
        outcomes: [
          {
            id: "fumble-cancelled",
            name: "Fumble cancelled, ball retained",
            matches: (r) => skillTriggered(r, SkillType.SAFE_PASS),
            verify: (r) => {
              assert(!turnoverHappened(r), "no turnover on Safe Pass");
              const ball = r.snapshot.ballPosition;
              assert(
                !!ball && ball.x === 4 && ball.y === 5,
                "ball must stay with the passer"
              );
            },
          },
        ],
      },
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
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
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
