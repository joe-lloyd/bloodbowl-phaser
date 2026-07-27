/**
 * The scenario-case schema is the contract every E2E lane depends on, so its
 * failure modes are worth pinning: a case that asserts nothing, a variant
 * with no seed, a ref to a player the setup never placed, and a required
 * layer with no adapter must all be rejected by name.
 */

import { describe, it, expect } from "vitest";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { Scenario } from "../../../src/types/Scenario";
import { SCENARIOS } from "../../../src/data/scenarios";
import {
  ScenarioCase,
  SemanticStep,
  ExecutionLayer,
  step,
  checkpointsForLayer,
  validateScenarioCase,
  validateScenarioCases,
  assertValidScenarioCases,
  sortScenarioCases,
  expandRuns,
  runsForLayer,
  matchesQuery,
  findByRegressionId,
  scenarioCaseFromLegacy,
  scenarioCasesFromLegacy,
  isSeededScenario,
  DEFAULT_LEGACY_SEED,
} from "../../../src/testing/scenarioCase";
import {
  resolveReference,
  resolveCommandReferences,
  referencesInCommand,
  parsePlayerRef,
} from "../../../src/game/rules-lab/references";

function baseCase(overrides: Partial<ScenarioCase> = {}): ScenarioCase {
  return {
    id: "sample-case",
    name: "Sample",
    description: "A minimal valid case",
    capability: "movement",
    interactions: ["move"],
    setup: {
      team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
      team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
    steps: [
      step(
        { type: "declare-action", playerId: "team1:0", action: "move" },
        "declare a Move"
      ),
    ],
    layers: ["engine"],
    variants: [
      {
        id: "default",
        name: "Default",
        seed: 7,
        expectedOutcome: "the move is declared",
      },
    ],
    checkpoints: [
      {
        id: "declared",
        description: "the action is declared",
        assert: () => undefined,
      },
    ],
    ...overrides,
  };
}

describe("scenario-case schema", () => {
  it("accepts a minimal well-formed case", () => {
    expect(validateScenarioCase(baseCase())).toEqual([]);
  });

  it("rejects a case that asserts nothing", () => {
    const issues = validateScenarioCase(baseCase({ checkpoints: [] }));
    expect(issues.map((i) => i.message)).toContain(
      "case asserts nothing — add at least one checkpoint"
    );
  });

  it("rejects a variant without a committed integer seed", () => {
    const issues = validateScenarioCase(
      baseCase({
        variants: [
          {
            id: "drifted",
            name: "Drifted",
            seed: Number.NaN,
            expectedOutcome: "nothing in particular",
          },
        ],
      })
    );
    expect(issues.map((i) => i.field)).toContain("variants[0].seed");
    expect(issues.find((i) => i.field === "variants[0].seed")?.message).toMatch(
      /pnpm e2e:seeds/
    );
  });

  it("rejects a step referencing a player who is not on the pitch", () => {
    const issues = validateScenarioCase(
      baseCase({
        steps: [
          step({ type: "declare-action", playerId: "team1:4", action: "move" }),
        ],
      })
    );
    expect(issues[0].message).toMatch(
      /ref 'team1:4' names a player who is not on the pitch at this point/
    );
  });

  it("accepts a ref to a player an earlier step placed", () => {
    // Setup-driving cases start from an empty board and place their own
    // players; a `place-player` step is exactly where an unplaced ref belongs.
    const issues = validateScenarioCase(
      baseCase({
        steps: [
          step({ type: "place-player", playerId: "team1:4", x: 3, y: 3 }),
          step({ type: "declare-action", playerId: "team1:4", action: "move" }),
        ],
      })
    );
    expect(issues).toEqual([]);
  });

  it("rejects a target square outside the pitch", () => {
    const issues = validateScenarioCase(
      baseCase({
        steps: [step({ type: "pass", playerId: "team1:0", x: 25, y: 5 })],
      })
    );
    expect(issues.some((i) => /outside the 20x11 pitch/.test(i.message))).toBe(
      true
    );
  });

  it("rejects a query command posing as an interaction step", () => {
    const issues = validateScenarioCase(
      baseCase({ steps: [step({ type: "state" })] })
    );
    expect(issues.some((i) => /is a query, not an interaction/.test(i.message))).toBe(
      true
    );
  });

  it("names the case and step when a required layer has no adapter", () => {
    const engineOnly = {
      supports: (layer: ExecutionLayer, _s: SemanticStep) => layer === "engine",
    };
    const issues = validateScenarioCase(
      baseCase({
        layers: ["engine", "browser"],
        checkpoints: [
          {
            id: "declared",
            description: "declared",
            layers: ["engine", "browser"],
            assert: () => undefined,
          },
        ],
      }),
      engineOnly
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      "case requires the 'browser' layer but step 'declare a Move' has no browser adapter"
    );
  });

  it("requires the browser layer alongside a visual layer", () => {
    const issues = validateScenarioCase(
      baseCase({ layers: ["engine", "visual"] })
    );
    expect(issues.map((i) => i.message)).toContain(
      "a visual case must also require the browser layer"
    );
  });

  it("requires a UI-boundary regression to also run in the browser", () => {
    const issues = validateScenarioCase(
      baseCase({
        regression: {
          id: "BUG-canvas-click",
          summary: "clicking the pitch selected the wrong square",
          uiBoundary: true,
        },
      })
    );
    expect(
      issues.some((i) => /must also require the 'browser' layer/.test(i.message))
    ).toBe(true);
  });

  it("requires an isolation reason for every synthetic grant", () => {
    const issues = validateScenarioCase(
      baseCase({
        syntheticGrants: [{ player: "team1:0", reason: "  " }],
      })
    );
    expect(issues.map((i) => i.message)).toContain(
      "synthetic grant on team1:0 needs an isolation reason"
    );
  });

  it("reports duplicate case and regression ids across the registry", () => {
    const regression = { id: "BUG-1", summary: "went wrong" };
    const issues = validateScenarioCases([
      baseCase({ regression }),
      baseCase({ regression }),
    ]);
    expect(issues.map((i) => i.message)).toContain(
      "duplicate case id — two cases cannot share an id"
    );
    expect(
      issues.some((i) => /duplicate regression id 'BUG-1'/.test(i.message))
    ).toBe(true);
  });

  it("assertValidScenarioCases lists every problem at once", () => {
    expect(() =>
      assertValidScenarioCases([baseCase({ checkpoints: [], interactions: [] })])
    ).toThrow(/2 scenario-case validation issue\(s\)/);
  });
});

describe("stable references", () => {
  const ctx = {
    team1: { id: "team1", players: [{ id: "team1-player-1" }, { id: "team1-player-2" }] },
    team2: { id: "team2", players: [{ id: "team2-player-1" }] },
  };

  it("resolves team and player refs to this run's ids", () => {
    expect(resolveReference(ctx, "team1")).toBe("team1");
    expect(resolveReference(ctx, "team2:0")).toBe("team2-player-1");
    expect(resolveReference(ctx, "team1:1")).toBe("team1-player-2");
  });

  it("passes a literal id through untouched", () => {
    expect(resolveReference(ctx, "team1-player-2")).toBe("team1-player-2");
  });

  it("throws for a ref past the end of the roster", () => {
    expect(() => resolveReference(ctx, "team2:9")).toThrow(
      "no player for ref 'team2:9'"
    );
  });

  it("resolves every reference field of a command", () => {
    const resolved = resolveCommandReferences(ctx, {
      type: "block",
      attackerId: "team1:0",
      defenderId: "team2:0",
    });
    expect(resolved).toEqual({
      type: "block",
      attackerId: "team1-player-1",
      defenderId: "team2-player-1",
    });
  });

  it("resolves the award-mvp nomination list", () => {
    const resolved = resolveCommandReferences(ctx, {
      type: "award-mvp",
      teamId: "team1",
      nominatedPlayerIds: ["team1:0", "team1:1"],
    });
    expect(resolved).toEqual({
      type: "award-mvp",
      teamId: "team1",
      nominatedPlayerIds: ["team1-player-1", "team1-player-2"],
    });
  });

  it("lists only the refs a command actually carries", () => {
    expect(
      referencesInCommand({ type: "move", playerId: "team1:0", path: [] })
    ).toEqual(["team1:0"]);
    expect(
      referencesInCommand({ type: "move", playerId: "raw-id", path: [] })
    ).toEqual([]);
  });

  it("parses a player ref into side and index", () => {
    expect(parsePlayerRef("team2:3")).toEqual({ team: "team2", index: 3 });
    expect(parsePlayerRef("team3:1")).toBeNull();
  });
});

describe("registry ordering and selection", () => {
  const cases = [
    baseCase({
      id: "b-case",
      variants: [
        { id: "z", name: "Z", seed: 2, expectedOutcome: "z" },
        { id: "a", name: "A", seed: 1, expectedOutcome: "a" },
      ],
    }),
    baseCase({ id: "a-case", tags: ["slow"], layers: ["engine", "browser"] }),
  ];

  it("orders cases and their variants by id", () => {
    const sorted = sortScenarioCases(cases);
    expect(sorted.map((c) => c.id)).toEqual(["a-case", "b-case"]);
    expect(sorted[1].variants.map((v) => v.id)).toEqual(["a", "z"]);
  });

  it("does not mutate the input array", () => {
    sortScenarioCases(cases);
    expect(cases.map((c) => c.id)).toEqual(["b-case", "a-case"]);
  });

  it("expands to stable case/variant keys", () => {
    expect(expandRuns(cases).map((run) => run.key)).toEqual([
      "a-case/default",
      "b-case/a",
      "b-case/z",
    ]);
  });

  it("selects runs by layer", () => {
    expect(runsForLayer(cases, "browser").map((run) => run.key)).toEqual([
      "a-case/default",
    ]);
  });

  it("matches a query against id, capability, tag and regression id", () => {
    const tagged = baseCase({
      tags: ["slow"],
      regression: { id: "BUG-77", summary: "broke" },
    });
    expect(matchesQuery(tagged, "slow")).toBe(true);
    expect(matchesQuery(tagged, "BUG-77")).toBe(true);
    expect(matchesQuery(tagged, "movement")).toBe(true);
    expect(matchesQuery(tagged, "nothing-like-this")).toBe(false);
    expect(matchesQuery(tagged, "  ")).toBe(true);
  });

  it("finds cases by regression id", () => {
    const regression = { id: "BUG-9", summary: "broke" };
    const found = findByRegressionId(
      [baseCase({ id: "with-bug", regression }), baseCase({ id: "without" })],
      "BUG-9"
    );
    expect(found.map((c) => c.id)).toEqual(["with-bug"]);
  });
});

describe("checkpoint layer filtering", () => {
  it("keeps checkpoints that apply to the requested layer", () => {
    const scenarioCase = baseCase({
      layers: ["engine", "browser"],
      checkpoints: [
        { id: "both", description: "both", assert: () => undefined },
        {
          id: "engine-only",
          description: "engine only",
          layers: ["engine"],
          assert: () => undefined,
        },
      ],
      variants: [
        {
          id: "default",
          name: "Default",
          seed: 1,
          expectedOutcome: "ok",
          checkpoints: [
            {
              id: "browser-only",
              description: "browser only",
              layers: ["browser"],
              assert: () => undefined,
            },
          ],
        },
      ],
    });
    const variant = scenarioCase.variants[0];
    expect(
      checkpointsForLayer(scenarioCase, variant, "engine").map((c) => c.id)
    ).toEqual(["both", "engine-only"]);
    expect(
      checkpointsForLayer(scenarioCase, variant, "browser").map((c) => c.id)
    ).toEqual(["both", "browser-only"]);
  });
});

describe("legacy scenario compatibility", () => {
  const seeded: Scenario = {
    id: "legacy-demo",
    name: "Legacy Demo",
    description: "a seeded legacy scenario",
    seed: 42,
    expectedOutcome: "the ball sits on the pickup square",
    setup: {
      team1Placements: [{ playerIndex: 0, x: 9, y: 7 }],
      team2Placements: [],
      ballPosition: { x: 10, y: 7 },
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };

  it("promotes a seeded scenario into a valid case", () => {
    const promoted = scenarioCaseFromLegacy(seeded);
    expect(promoted.id).toBe("legacy-legacy-demo");
    expect(promoted.source).toEqual({
      kind: "legacy-scenario",
      id: "legacy-demo",
    });
    expect(promoted.variants[0].seed).toBe(42);
    expect(validateScenarioCase(promoted)).toEqual([]);
  });

  it("promotes an unseeded scenario on the pinned default seed", () => {
    const { seed: _seed, ...unseeded } = seeded;
    expect(isSeededScenario(unseeded as Scenario)).toBe(false);
    // The setup-loaded checkpoint needs no dice, so an unseeded scenario
    // still has something real to assert — it just needs a fixed seed so the
    // run is reproducible.
    const promoted = scenarioCaseFromLegacy(unseeded as Scenario);
    expect(promoted.variants[0].seed).toBe(DEFAULT_LEGACY_SEED);
    expect(validateScenarioCase(promoted)).toEqual([]);
  });

  it("its checkpoint catches a setup that did not materialise", () => {
    const promoted = scenarioCaseFromLegacy(seeded);
    const observed = {
      layer: "engine" as const,
      initialSnapshot: {
        phase: GamePhase.PLAY,
        ballPosition: { x: 1, y: 1 },
        teams: [
          { players: [{ name: "Runner", position: { x: 9, y: 7 } }] },
          { players: [] },
        ],
      },
      snapshot: {},
      events: [],
      decisions: [],
      responses: [],
    } as never;
    expect(() => promoted.checkpoints[0].assert(observed)).toThrow(
      /ball should start at \(10,7\)/
    );
  });

  it("every promoted production scenario passes validation", () => {
    const promoted = scenarioCasesFromLegacy(SCENARIOS);
    expect(promoted.length).toBeGreaterThan(0);
    expect(validateScenarioCases(promoted)).toEqual([]);
  });
});
