/**
 * Rule scenarios — Passing skills (Pass, Sure Hands).
 * Assertions migrated from skill-rerolls.test.ts.
 */

import { SkillType } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import { GamePhase, SubPhase } from "../../types/GameState";
import {
  RuleScenarioEntry,
  RuleConfig,
  playSetup,
  skillRerollConfig,
  assert,
  skillTriggered,
  skillCheckDiff,
  turnoverHappened,
  playerAt,
  playerOf,
  rerollOffered,
  rerollUsed,
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

/**
 * Interception is a CORE rule, not a skill. This standalone config pins the
 * Range Ruler geometry and outcome via findSeed in the headless interception
 * tests. It is intentionally NOT part of PASSING_RULE_SCENARIOS, so the
 * skill-coverage gate snapshot is unaffected.
 *
 * Layout — passer (4,5) with the ball throws a Short Pass to the catcher at
 * (10,5). The interceptor stands on the pass line at (7,5); a decoy sits off
 * the line at (7,8) and must never be offered.
 */
export const INTERCEPTION_SCENARIO: RuleConfig = {
  id: "interception-short-pass",
  name: "Intercept a short pass",
  description:
    "A standing defender on the pass line may intercept; success steals the ball and causes a turnover",
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // passer (holds the ball)
      { playerIndex: 1, x: 10, y: 5 }, // catcher
    ],
    team2Placements: [
      { playerIndex: 0, x: 7, y: 5 }, // interceptor — on the ruler
      { playerIndex: 1, x: 7, y: 8 }, // decoy — off the ruler
    ],
    ballPosition: { x: 4, y: 5 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "pass" },
    { type: "pass", playerId: "team1:0", x: 10, y: 5 },
  ],
  seedSearch: { from: 1, limit: 500 },
  outcomes: [
    {
      id: "offered",
      name: "The on-ruler defender is offered an interception (-3 vs accurate)",
      matches: (r) =>
        r.decisions.some(
          (d) =>
            d.type === "interception" &&
            d.candidates.some((c) => c.modifier === -3)
        ),
      verify: (r) => {
        const d = r.decisions.find((x) => x.type === "interception");
        assert(!!d && d.type === "interception", "an interception is raised");
        if (!d || d.type !== "interception") return;
        assert(
          d.chooserTeamId === r.game.ctx.team2.id,
          "the defending team chooses the interceptor"
        );
        assert(
          d.candidates.length === 1,
          "only the on-ruler standing defender is eligible (decoy excluded)"
        );
        assert(
          d.candidates[0].playerId === r.game.ctx.team2.players[0].id,
          "the eligible interceptor is the defender on the pass line"
        );
        assert(
          d.candidates[0].modifier === -3,
          "an accurate pass gives the interceptor a -3 modifier"
        );
      },
    },
    {
      id: "intercepted",
      name: "A successful interception steals the ball and causes a turnover",
      matches: (r) =>
        r.events.some((e) => e.name === GameEventNames.PassIntercepted),
      verify: (r) => {
        const ev = r.events.find(
          (e) => e.name === GameEventNames.PassIntercepted
        );
        assert(!!ev, "a PassIntercepted event is emitted");
        const data = ev!.data as {
          interceptorId: string;
          position: { x: number; y: number };
        };
        assert(
          data.interceptorId === r.game.ctx.team2.players[0].id,
          "the on-ruler defender is the interceptor"
        );
        assert(turnoverHappened(r), "an interception causes a turnover");
        const ball = r.snapshot.ballPosition;
        assert(
          !!ball && ball.x === 7 && ball.y === 5,
          "the interceptor gains the ball in their own square"
        );
      },
    },
  ],
};

/** Reusable "an interception is offered" outcome check. */
function interceptionOffered(expectedModifier: number, candidateCount: number) {
  return {
    matches: (r: import("../../game/rules-lab").ScriptResult) =>
      r.decisions.some(
        (d) =>
          d.type === "interception" &&
          d.candidates.length === candidateCount &&
          d.candidates.some((c) => c.modifier === expectedModifier)
      ),
    verify: (r: import("../../game/rules-lab").ScriptResult) => {
      const d = r.decisions.find((x) => x.type === "interception");
      assert(!!d && d.type === "interception", "an interception is raised");
      if (!d || d.type !== "interception") return;
      assert(
        d.chooserTeamId === r.game.ctx.team2.id,
        "the defending team chooses the interceptor"
      );
      assert(
        d.candidates.length === candidateCount,
        `expected ${candidateCount} eligible interceptor(s)`
      );
      assert(
        d.candidates.some((c) => c.modifier === expectedModifier),
        `a candidate at modifier ${expectedModifier}`
      );
    },
  };
}

/**
 * Interceptor marked by a passing-team player: the catcher stands on the
 * target square (8,5), adjacent to the interceptor at (7,5), so an accurate
 * pass gives the interceptor -3 (accurate) -1 (marked) = -4.
 */
export const INTERCEPTION_MARKED_SCENARIO: RuleConfig = {
  id: "interception-marked",
  name: "Marking stacks onto the interception penalty",
  description: "An accurate pass past a marked interceptor is a -4 attempt",
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // passer
      { playerIndex: 1, x: 8, y: 5 }, // catcher, marks (7,5)
    ],
    team2Placements: [{ playerIndex: 0, x: 7, y: 5 }], // interceptor
    ballPosition: { x: 4, y: 5 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "pass" },
    { type: "pass", playerId: "team1:0", x: 8, y: 5 },
  ],
  seedSearch: { from: 1, limit: 500 },
  outcomes: [
    {
      id: "offered-marked",
      name: "The marked interceptor is offered at -4",
      ...interceptionOffered(-4, 1),
    },
  ],
};

/**
 * Two standing defenders on the pass line: the defending coach is offered
 * both and picks one.
 */
export const INTERCEPTION_MULTI_SCENARIO: RuleConfig = {
  id: "interception-multi",
  name: "Coach chooses among several interceptors",
  description: "Two defenders under the ruler are both offered",
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // passer
      { playerIndex: 1, x: 10, y: 5 }, // catcher
    ],
    team2Placements: [
      { playerIndex: 0, x: 6, y: 5 }, // interceptor A
      { playerIndex: 1, x: 8, y: 5 }, // interceptor B
    ],
    ballPosition: { x: 4, y: 5 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "pass" },
    { type: "pass", playerId: "team1:0", x: 10, y: 5 },
  ],
  seedSearch: { from: 1, limit: 500 },
  outcomes: [
    {
      id: "two-candidates",
      name: "Both on-ruler defenders are eligible",
      matches: (r) =>
        r.decisions.some(
          (d) => d.type === "interception" && d.candidates.length === 2
        ),
      verify: (r) => {
        const d = r.decisions.find((x) => x.type === "interception");
        assert(!!d && d.type === "interception", "an interception is raised");
        if (!d || d.type !== "interception") return;
        const ids = new Set(d.candidates.map((c) => c.playerId));
        assert(
          ids.has(r.game.ctx.team2.players[0].id) &&
            ids.has(r.game.ctx.team2.players[1].id),
          "both defenders on the pass line are offered"
        );
      },
    },
  ],
};

/**
 * Declining the interception lets the pass carry on to its landing square —
 * the interceptor never gains the ball.
 */
export const INTERCEPTION_DECLINE_SCENARIO: RuleConfig = {
  id: "interception-decline",
  name: "Declining leaves the pass to resolve normally",
  description: "A declined interception does not steal the ball",
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // passer
      { playerIndex: 1, x: 10, y: 5 }, // catcher
    ],
    team2Placements: [{ playerIndex: 0, x: 7, y: 5 }], // interceptor
    ballPosition: { x: 4, y: 5 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "pass" },
    { type: "pass", playerId: "team1:0", x: 10, y: 5 },
  ],
  decisionPolicy: { acceptInterceptions: false },
  seedSearch: { from: 1, limit: 500 },
  outcomes: [
    {
      id: "declined",
      name: "Offered then declined — no steal",
      matches: (r) =>
        r.decisions.some((d) => d.type === "interception") &&
        !r.events.some((e) => e.name === GameEventNames.PassIntercepted),
      verify: (r) => {
        assert(
          !r.events.some((e) => e.name === GameEventNames.PassIntercepted),
          "no interception occurs when declined"
        );
        const ball = r.snapshot.ballPosition;
        assert(
          !ball || !(ball.x === 7 && ball.y === 5),
          "the declined interceptor never holds the ball"
        );
      },
    },
  ],
};

/**
 * No opponent under the ruler → no interception is offered at all (negative
 * case; the lone defender sits well off the pass line).
 */
export const INTERCEPTION_NONE_SCENARIO: RuleConfig = {
  id: "interception-none",
  name: "No interception when nobody is under the ruler",
  description: "A clear lane raises no interception decision",
  setup: playSetup({
    team1Placements: [
      { playerIndex: 0, x: 4, y: 5 }, // passer
      { playerIndex: 1, x: 7, y: 5 }, // catcher
    ],
    team2Placements: [{ playerIndex: 0, x: 4, y: 12 }], // far off the lane
    ballPosition: { x: 4, y: 5 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "pass" },
    { type: "pass", playerId: "team1:0", x: 7, y: 5 },
  ],
  seedSearch: { from: 1, limit: 500 },
  outcomes: [
    {
      id: "no-interception",
      name: "The throw resolves with no interception offered",
      matches: (r) =>
        r.events.some((e) => e.name === GameEventNames.PassAttempted) &&
        !r.decisions.some((d) => d.type === "interception"),
      verify: (r) => {
        assert(
          !r.decisions.some((d) => d.type === "interception"),
          "no interception decision is raised for a clear lane"
        );
      },
    },
  ],
};

/** All seeded interception scenarios, for the headless interception suite. */
export const INTERCEPTION_SCENARIOS: RuleConfig[] = [
  INTERCEPTION_SCENARIO,
  INTERCEPTION_MARKED_SCENARIO,
  INTERCEPTION_MULTI_SCENARIO,
  INTERCEPTION_DECLINE_SCENARIO,
  INTERCEPTION_NONE_SCENARIO,
];

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
    skill: SkillType.CLOUD_BURSTER,
    configs: [
      {
        id: "cloud-burster-no-intercept",
        name: "Cloud Burster denies interception",
        description:
          "A defender standing on the pass line is never offered an interception",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.CLOUD_BURSTER] },
            { playerIndex: 1, x: 10, y: 5 }, // catcher
          ],
          team2Placements: [{ playerIndex: 0, x: 7, y: 5 }], // on the ruler
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 10, y: 5 },
        ],
        seedSearch: { from: 1, limit: 200 },
        outcomes: [
          {
            id: "interception-suppressed",
            name: "No interception is offered under the ruler",
            matches: (r) =>
              skillTriggered(r, SkillType.CLOUD_BURSTER) &&
              !r.decisions.some((d) => d.type === "interception"),
            verify: (r) => {
              assert(
                !r.decisions.some((d) => d.type === "interception"),
                "Cloud Burster must suppress the interception offer"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.HAIL_MARY_PASS,
    configs: [
      {
        id: "hail-mary-no-intercept",
        name: "Hail Mary Pass cannot be intercepted",
        description:
          "A defender on the pass line is never offered an interception",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.HAIL_MARY_PASS] },
            { playerIndex: 1, x: 10, y: 5 }, // catcher
          ],
          team2Placements: [{ playerIndex: 0, x: 7, y: 5 }], // on the ruler
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 10, y: 5 },
        ],
        seedSearch: { from: 1, limit: 200 },
        outcomes: [
          {
            id: "no-interception",
            name: "No interception offered under the ruler",
            matches: (r) =>
              skillTriggered(r, SkillType.HAIL_MARY_PASS) &&
              !r.decisions.some((d) => d.type === "interception"),
            verify: (r) =>
              assert(
                !r.decisions.some((d) => d.type === "interception"),
                "Hail Mary Pass must suppress interception"
              ),
          },
        ],
      },
      {
        id: "hail-mary-downgrades-accurate",
        name: "An accurate Hail Mary is treated as inaccurate",
        description:
          "A successful Passing Ability Test still scatters from the target",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.HAIL_MARY_PASS] },
            { playerIndex: 1, x: 8, y: 5 }, // catcher
          ],
          team2Placements: [{ playerIndex: 0, x: 20, y: 12 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 8, y: 5 },
        ],
        decisionPolicy: { acceptRerolls: false },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "accurate-scatters",
            name: "A passed PA test scatters the ball off-target",
            matches: (r) =>
              skillTriggered(r, SkillType.HAIL_MARY_PASS) &&
              r.events.some(
                (e) =>
                  e.name === GameEventNames.DiceRoll &&
                  !!(e.data as { rollType?: string }).rollType?.startsWith(
                    "Pass"
                  ) &&
                  (e.data as { resultState?: string }).resultState === "success"
              ) &&
              r.events.some(
                (e) =>
                  e.name === GameEventNames.PassAttempted &&
                  (e.data as { accurate?: boolean }).accurate === false
              ),
            verify: (r) =>
              assert(
                r.events.some(
                  (e) =>
                    e.name === GameEventNames.PassAttempted &&
                    (e.data as { accurate?: boolean }).accurate === false
                ),
                "an accurate Hail Mary must be reported inaccurate (scatter)"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.GIVE_AND_GO,
    configs: [
      {
        id: "give-and-go-quick-pass",
        name: "Give and Go after a Quick Pass",
        description:
          "After a completed Quick Pass causes no Turnover, the passer may continue moving with their remaining movement",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 4,
              y: 5,
              skills: [SkillType.GIVE_AND_GO],
            },
            { playerIndex: 1, x: 7, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
          { type: "move", playerId: "team1:0", path: [{ x: 3, y: 5 }] },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "moves-after-quick-pass",
            name: "The passer continues moving",
            matches: (r) =>
              skillTriggered(r, SkillType.GIVE_AND_GO) &&
              !turnoverHappened(r) &&
              playerAt(r, "team1:0", { x: 3, y: 5 }),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "the completed Quick Pass must not cause a Turnover"
              );
              assert(
                playerAt(r, "team1:0", { x: 3, y: 5 }),
                "Give and Go must leave the passer active to continue moving"
              );
            },
          },
        ],
      },
      {
        id: "give-and-go-handoff",
        name: "Give and Go after a Hand-off",
        description:
          "After a completed Hand-off causes no Turnover, the ball carrier may continue moving with their remaining movement",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 4,
              y: 5,
              skills: [SkillType.GIVE_AND_GO],
            },
            { playerIndex: 1, x: 5, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "handoff" },
          { type: "handoff", playerId: "team1:0", x: 5, y: 5 },
          { type: "move", playerId: "team1:0", path: [{ x: 3, y: 5 }] },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "moves-after-handoff",
            name: "The ball carrier continues moving",
            matches: (r) =>
              skillTriggered(r, SkillType.GIVE_AND_GO) &&
              !turnoverHappened(r) &&
              playerAt(r, "team1:0", { x: 3, y: 5 }),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "the completed Hand-off must not cause a Turnover"
              );
              assert(
                playerAt(r, "team1:0", { x: 3, y: 5 }),
                "Give and Go must leave the ball carrier active after a Hand-off"
              );
            },
          },
        ],
      },
      {
        id: "give-and-go-turnover",
        name: "Give and Go stops on a Turnover",
        description:
          "Give and Go cannot keep the activation open when the Quick Pass causes a Turnover",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 4,
              y: 5,
              skills: [SkillType.GIVE_AND_GO],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "turnover-ends-activation",
            name: "The passer cannot continue after the Turnover",
            matches: (r) =>
              turnoverHappened(r) &&
              !skillTriggered(r, SkillType.GIVE_AND_GO) &&
              r.snapshot.activeTeamId === r.game.ctx.team2.id,
            verify: (r) => {
              assert(turnoverHappened(r), "the incomplete Pass is a Turnover");
              assert(
                !skillTriggered(r, SkillType.GIVE_AND_GO),
                "Give and Go must not trigger after a Turnover"
              );
              assert(
                r.snapshot.activeTeamId === r.game.ctx.team2.id,
                "the Turnover must end the passing team's turn"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.DIVING_CATCH,
    configs: [
      {
        id: "diving-catch-adjacent-pass",
        name: "Diving Catch reaches an adjacent Pass",
        description:
          "A player may attempt to catch a Pass that lands in an adjacent square in their Tackle Zone",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 },
            {
              playerIndex: 1,
              x: 7,
              y: 6,
              skills: [SkillType.DIVING_CATCH],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "adjacent-catch",
            name: "The adjacent player catches the ball",
            matches: (r) =>
              skillTriggered(r, SkillType.DIVING_CATCH) &&
              !turnoverHappened(r) &&
              r.snapshot.ballPosition?.x === 7 &&
              r.snapshot.ballPosition?.y === 6,
            verify: (r) =>
              assert(
                r.snapshot.ballPosition?.x === 7 &&
                  r.snapshot.ballPosition?.y === 6,
                "the caught ball must move onto the Diving Catch player"
              ),
          },
        ],
      },
      {
        id: "diving-catch-target-bonus",
        name: "Diving Catch gains +1 in the Pass target square",
        description:
          "When the player occupies the declared target square of a Pass, Diving Catch adds +1 to the catch Agility Test",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 },
            {
              playerIndex: 1,
              x: 7,
              y: 5,
              skills: [SkillType.DIVING_CATCH],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "plus-one",
            name: "+1 is applied to the catch",
            matches: (r) =>
              skillTriggered(r, SkillType.DIVING_CATCH) &&
              skillCheckDiff(r, "Catch") === 1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Catch") === 1,
                "Diving Catch must add exactly +1 in the Pass target square"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.DUMP_OFF,
    configs: [
      {
        id: "dump-off-before-block",
        name: "Quick Pass before a Block",
        description:
          "The targeted carrier may complete a no-Turnover Quick Pass before block dice are rolled",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.DUMP_OFF],
            },
            { playerIndex: 1, x: 12, y: 5 },
          ],
          ballPosition: { x: 11, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "block" },
          {
            type: "block",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        decisionPolicy: {
          acceptReactions: true,
          preferBlockResult: "push",
          followUp: false,
        },
        outcomes: [
          {
            id: "pass-precedes-block",
            name: "Dump-Off resolves before the incoming Block",
            matches: (r) =>
              skillTriggered(r, SkillType.DUMP_OFF) &&
              r.events.some((e) => e.name === GameEventNames.BlockDiceRolled),
            verify: (r) => {
              const passIndex = r.events.findIndex(
                (e) => e.name === GameEventNames.PassAttempted
              );
              const blockIndex = r.events.findIndex(
                (e) => e.name === GameEventNames.BlockDiceRolled
              );
              assert(passIndex >= 0, "Dump-Off must attempt a Quick Pass");
              assert(
                passIndex < blockIndex,
                "the Quick Pass must resolve before block dice are rolled"
              );
              assert(
                !r.events
                  .slice(passIndex, blockIndex)
                  .some((e) => e.name === GameEventNames.Turnover),
                "the Dump-Off pass must not cause a Turnover"
              );
            },
          },
        ],
      },
      {
        id: "dump-off-before-stab-without-receiver",
        name: "Quick Pass to an empty square before Stab",
        description:
          "A lone carrier may use Dump-Off against a directly targeting Special Action even when no team-mate is available",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.STAB],
            },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.DUMP_OFF],
            },
          ],
          ballPosition: { x: 11, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "stab" },
          {
            type: "stab",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        decisionPolicy: { acceptReactions: true },
        outcomes: [
          {
            id: "empty-pass-precedes-stab",
            name: "Dump-Off targets an empty square before Stab",
            matches: (r) =>
              skillTriggered(r, SkillType.DUMP_OFF) &&
              r.events.some(
                (event) =>
                  event.name === GameEventNames.DiceRoll &&
                  (event.data as { rollType?: string }).rollType ===
                    "Armor Check"
              ),
            verify: (r) => {
              const passIndex = r.events.findIndex(
                (event) => event.name === GameEventNames.PassAttempted
              );
              const stabIndex = r.events.findIndex(
                (event) =>
                  event.name === GameEventNames.DiceRoll &&
                  (event.data as { rollType?: string }).rollType ===
                    "Armor Check"
              );
              assert(
                passIndex >= 0,
                "Dump-Off must allow an empty-square Quick Pass"
              );
              assert(
                passIndex < stabIndex,
                "the Quick Pass must resolve before Stab's Armour Roll"
              );
              assert(
                !r.events
                  .slice(passIndex, stabIndex)
                  .some((event) => event.name === GameEventNames.Turnover),
                "the empty-square Dump-Off must not cause a Turnover"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.LEADER,
    configs: [
      {
        id: "leader-reroll",
        name: "Leader Re-roll for the half",
        description:
          "An on-pitch Leader grants one Team Re-roll even when none were purchased",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 4,
              y: 5,
              skills: [SkillType.LEADER],
            },
            { playerIndex: 1, x: 5, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 6, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:1", action: "move" },
          {
            type: "move",
            playerId: "team1:1",
            path: [{ x: 6, y: 5 }],
          },
        ],
        rerolls: { team1: 0 },
        decisionPolicy: { acceptRerolls: "team" },
        outcomes: [
          {
            id: "leader-reroll-spent",
            name: "The Leader Re-roll is offered and spent",
            matches: (r) =>
              rerollOffered(r, { rollKind: "pickup", source: "team" }) &&
              skillTriggered(r, SkillType.LEADER),
            verify: (r) => {
              assert(
                rerollUsed(r, "team"),
                "the failed pickup must spend the Leader Re-roll"
              );
              assert(
                skillTriggered(r, SkillType.LEADER),
                "Leader must announce when its re-roll is spent"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.ON_THE_BALL,
    configs: [
      {
        id: "on-the-ball-pre-pass-move",
        name: "Reactive movement before a Pass",
        description:
          "An opposition On the Ball player moves three squares after target declaration and before the PA roll",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 },
            { playerIndex: 1, x: 8, y: 5 },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 12,
              y: 5,
              skills: [SkillType.ON_THE_BALL],
            },
          ],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 8, y: 5 },
        ],
        decisionPolicy: {
          acceptReactions: true,
          acceptInterceptions: false,
        },
        outcomes: [
          {
            id: "moves-before-pa",
            name: "Three-square reaction precedes the PA test",
            matches: (r) =>
              skillTriggered(r, SkillType.ON_THE_BALL) &&
              r.events.filter(
                (e) =>
                  e.name === GameEventNames.PlayerMoved &&
                  (e.data as { playerId?: string }).playerId ===
                    r.game.ctx.team2.players[0].id
              ).length === 3,
            verify: (r) => {
              const moves = r.events
                .map((event, index) => ({ event, index }))
                .filter(
                  ({ event }) =>
                    event.name === GameEventNames.PlayerMoved &&
                    (event.data as { playerId?: string }).playerId ===
                      r.game.ctx.team2.players[0].id
                );
              const passRoll = r.events.findIndex(
                (event) =>
                  event.name === GameEventNames.DiceRoll &&
                  (event.data as { rollType?: string }).rollType?.startsWith(
                    "Pass"
                  )
              );
              assert(moves.length === 3, "On the Ball may move three squares");
              assert(
                moves.every(({ index }) => index < passRoll),
                "every reacting move must happen before the Passing Ability Test"
              );
            },
          },
        ],
      },
      {
        id: "on-the-ball-kickoff-move",
        name: "Receiving move before the Kick-off Event",
        description:
          "One Open receiving player moves after deviation, stays in their own half, and moves before the Kick-off Event",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 },
            { playerIndex: 1, x: 6, y: 4 },
            { playerIndex: 2, x: 6, y: 5 },
            { playerIndex: 3, x: 6, y: 6 },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 18,
              y: 8,
              skills: [SkillType.ON_THE_BALL],
            },
            { playerIndex: 1, x: 13, y: 4 },
            { playerIndex: 2, x: 13, y: 5 },
            { playerIndex: 3, x: 13, y: 6 },
          ],
          activeTeam: "team1",
          phase: GamePhase.KICKOFF,
          subPhase: SubPhase.ROLL_KICKOFF,
        },
        script: [{ type: "kick-ball", playerId: "team1:0", x: 16, y: 5 }],
        decisionPolicy: { acceptReactions: true },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "moves-before-kickoff-event",
            name: "The receiving player moves before the event roll",
            matches: (r) =>
              r.events.some(
                (event) =>
                  event.name === GameEventNames.SkillTriggered &&
                  (event.data as { skill?: string; effect?: string }).skill ===
                    SkillType.ON_THE_BALL &&
                  (event.data as { effect?: string }).effect?.includes(
                    "Kick-off Event"
                  )
              ),
            verify: (r) => {
              const moveIndex = r.events.findIndex(
                (event) =>
                  event.name === GameEventNames.PlayerMoved &&
                  (event.data as { playerId?: string }).playerId ===
                    r.game.ctx.team2.players[0].id
              );
              const eventIndex = r.events.findIndex(
                (event) =>
                  event.name === GameEventNames.DiceRoll &&
                  (event.data as { rollType?: string }).rollType ===
                    "Kickoff Event"
              );
              assert(moveIndex >= 0, "the receiving player must move");
              assert(
                eventIndex < 0 || moveIndex < eventIndex,
                "the move must happen before the Kick-off Event roll"
              );
              assert(
                playerOf(r, "team2:0").gridPosition!.x >= 13,
                "the receiving player may not enter the opposition half"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.PUNT,
    configs: [
      {
        id: "punt-loose-ball",
        name: "Punt to an empty part of the pitch",
        description:
          "Direction and distance use the Throw-in Template and a loose ball at rest is not a Turnover",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 7,
              skills: [SkillType.PUNT],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 20, y: 12 }],
          ballPosition: { x: 10, y: 7 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "punt" },
          { type: "punt", playerId: "team1:0", x: 1, y: 0 },
        ],
        outcomes: [
          {
            id: "loose-no-turnover",
            name: "The loose Punt settles without a Turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.PUNT) && !turnoverHappened(r),
            verify: (r) => {
              assert(
                !!r.snapshot.ballPosition &&
                  !(
                    r.snapshot.ballPosition.x === 10 &&
                    r.snapshot.ballPosition.y === 7
                  ),
                "the Punt must move the ball away from the carrier"
              );
              assert(
                !turnoverHappened(r),
                "a loose Punt at rest must not cause a Turnover"
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
