import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import {
  type ScenarioCase,
  step,
  validateScenarioCase,
  validateScenarioCases,
  findByRegressionId,
  matchesQuery,
} from "../../../src/testing/scenarioCase";
import { SCENARIO_CASES } from "../../../src/testing/cases";

function regressionCase(
  regression: ScenarioCase["regression"],
  overrides: Partial<ScenarioCase> = {}
): ScenarioCase {
  return {
    id: "regression-sample",
    name: "Sample",
    description: "sample",
    capability: "movement",
    interactions: ["protocol-command:move"],
    setup: {
      team1Placements: [{ playerIndex: 0, x: 5, y: 5 }],
      team2Placements: [],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
    steps: [
      step({ type: "move", playerId: "team1:0", path: [{ x: 6, y: 5 }] }),
    ],
    layers: ["engine"],
    ...(regression !== undefined && { regression: regression }),
    variants: [{ id: "v", name: "V", seed: 1, expectedOutcome: "moves" }],
    checkpoints: [{ id: "c", description: "c", assert: () => undefined }],
    ...overrides,
  };
}

describe("regression provenance", () => {
  it("accepts a well-formed engine regression", () => {
    expect(
      validateScenarioCase(
        regressionCase({
          id: "BUG-2026-07-example",
          summary: "the mover kept walking after a failed pick-up",
          reportedAt: "2026-07-21",
        })
      )
    ).toEqual([]);
  });

  it("requires a stable id and a summary of the original failure", () => {
    const issues = validateScenarioCase(
      regressionCase({ id: "  ", summary: "  " })
    );
    expect(issues.map((issue) => issue.field)).toEqual([
      "regression.id",
      "regression.summary",
    ]);
  });

  it("requires a browser case when the defect was at the UI boundary", () => {
    const issues = validateScenarioCase(
      regressionCase({
        id: "BUG-canvas",
        summary: "clicking the pitch selected the square to the left",
        uiBoundary: true,
      })
    );
    expect(issues).toHaveLength(1);
    expect(fixtureValue(issues[0]).message).toMatch(
      /UI-boundary defect, so the case must also require the 'browser' layer/
    );
  });

  it("accepts a UI-boundary regression that declares the browser layer", () => {
    expect(
      validateScenarioCase(
        regressionCase(
          {
            id: "BUG-canvas",
            summary: "clicking the pitch selected the square to the left",
            uiBoundary: true,
          },
          {
            layers: ["engine", "browser"],
            checkpoints: [
              {
                id: "c",
                description: "c",
                layers: ["engine", "browser"],
                assert: () => undefined,
              },
            ],
          }
        )
      )
    ).toEqual([]);
  });

  it("rejects two cases sharing a regression id", () => {
    const regression = {
      id: "BUG-duplicate",
      summary: "something went wrong",
    };
    const issues = validateScenarioCases([
      regressionCase(regression, { id: "first" }),
      regressionCase(regression, { id: "second" }),
    ]);
    expect(
      issues.some((issue) =>
        issue.message.includes("duplicate regression id 'BUG-duplicate'")
      )
    ).toBe(true);
  });

  it("keeps a regression findable by its id", () => {
    const cases = [
      regressionCase({ id: "BUG-findable", summary: "s" }, { id: "linked" }),
      regressionCase(undefined, { id: "unlinked" }),
    ];
    expect(findByRegressionId(cases, "BUG-findable").map((c) => c.id)).toEqual([
      "linked",
    ]);

    expect(matchesQuery(fixtureValue(cases[0]), "BUG-findable")).toBe(true);
    expect(matchesQuery(fixtureValue(cases[1]), "BUG-findable")).toBe(false);
  });
});

describe("the production registry honours the policy", () => {
  const regressions = SCENARIO_CASES.filter(
    (scenarioCase) => scenarioCase.regression
  );

  it("every regression id is unique", () => {
    const ids = regressions.map((c) => fixtureValue(c.regression).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every regression records what originally went wrong", () => {
    for (const scenarioCase of regressions) {
      expect(
        fixtureValue(scenarioCase.regression).summary.trim().length,
        scenarioCase.id
      ).toBeGreaterThan(0);
    }
  });

  it("every UI-boundary regression runs in the browser", () => {
    for (const scenarioCase of regressions) {
      if (!fixtureValue(scenarioCase.regression).uiBoundary) continue;
      expect(scenarioCase.layers, scenarioCase.id).toContain("browser");
    }
  });

  it("every regression is deterministic — a committed seed per variant", () => {
    for (const scenarioCase of regressions) {
      for (const variant of scenarioCase.variants) {
        expect(
          Number.isInteger(variant.seed),
          `${scenarioCase.id}/${variant.id}`
        ).toBe(true);
      }
    }
  });
});
