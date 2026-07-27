/**
 * The coverage gate.
 *
 * These are the checks that stop the report from flattering itself: an
 * exclusion without a reason, a stale exclusion id, a synthetic grant with
 * no justification, a variant with no committed seed, and — most
 * importantly — engine and visual coverage never being blended into one
 * number.
 */

import { describe, it, expect } from "vitest";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { SkillType } from "../../../src/types/Skills";
import { RosterName } from "../../../src/types/Team";
import { ScenarioCase, step } from "../../../src/testing/scenarioCase";
import { SCENARIO_CASES } from "../../../src/testing/cases";
import { ruleOutcomesMissingSeeds } from "../../../src/testing/cases/fromRuleConfigs";
import {
  buildInventory,
  INTERACTION_COMMANDS,
  DECISION_TYPES,
  DECISION_REPLY_COMMANDS,
} from "../../../src/testing/coverage/inventory";
import {
  COVERAGE_EXCLUSIONS,
  validateExclusions,
  isExcluded,
} from "../../../src/testing/coverage/exclusions";
import {
  buildCoverage,
  claimsOf,
  renderCoverageReport,
} from "../../../src/testing/coverage/report";
import { mergeCoverageResults } from "../../../src/testing/coverage/merge";
import { observedClaims } from "../../../src/testing/coverage/observed";

function sampleCase(overrides: Partial<ScenarioCase> = {}): ScenarioCase {
  return {
    id: "sample",
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
    steps: [step({ type: "move", playerId: "team1:0", path: [{ x: 6, y: 5 }] })],
    layers: ["engine"],
    variants: [
      { id: "v", name: "V", seed: 1, expectedOutcome: "moves" },
    ],
    checkpoints: [
      { id: "c", description: "c", assert: () => undefined },
    ],
    ...overrides,
  };
}

describe("gameplay inventory", () => {
  const inventory = buildInventory();

  it("covers every protocol command, decision and phase", () => {
    const ids = new Set(inventory.map((entry) => entry.id));
    for (const command of INTERACTION_COMMANDS) {
      expect(ids.has(`protocol-command:${command}`), command).toBe(true);
    }
    for (const decision of DECISION_TYPES) {
      expect(ids.has(`decision:${decision}`), decision).toBe(true);
    }
  });

  it("has no undefined or duplicate entry ids", () => {
    const ids = inventory.map((entry) => entry.id);
    expect(ids.filter((id) => id.endsWith(":undefined"))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic", () => {
    expect(buildInventory().map((e) => e.id)).toEqual(
      inventory.map((e) => e.id)
    );
  });

  it("maps every decision to at least one reply command in the protocol", () => {
    for (const decision of DECISION_TYPES) {
      const replies = DECISION_REPLY_COMMANDS[decision];
      expect(replies, decision).toBeDefined();
      expect(replies.length, decision).toBeGreaterThan(0);
      for (const reply of replies) {
        expect(INTERACTION_COMMANDS, `${decision} → ${reply}`).toContain(reply);
      }
    }
  });
});

describe("reviewed exclusions", () => {
  it("every committed exclusion explains itself and names a real entry", () => {
    const known = new Set(buildInventory().map((entry) => entry.id));
    expect(validateExclusions(COVERAGE_EXCLUSIONS, known)).toEqual([]);
  });

  it("rejects an exclusion with no reason, owner or tracking reference", () => {
    const issues = validateExclusions([
      { entryId: "decision:reroll", reason: " ", owner: " ", tracking: " " },
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      "exclusion needs a reason",
      "exclusion needs an owner",
      "exclusion needs a tracking reference",
    ]);
  });

  it("rejects an exclusion pointing at an entry that no longer exists", () => {
    const issues = validateExclusions(
      [
        {
          entryId: "protocol-command:teleport",
          reason: "r",
          owner: "o",
          tracking: "t",
        },
      ],
      new Set(["protocol-command:move"])
    );
    expect(issues[0].message).toMatch(/no longer exists/);
  });

  it("can excuse a single layer without excusing the entry", () => {
    const exclusions = [
      {
        entryId: "decision:reroll",
        layers: ["browser" as const],
        reason: "r",
        owner: "o",
        tracking: "t",
      },
    ];
    expect(isExcluded("decision:reroll", "browser", exclusions)).toBe(true);
    expect(isExcluded("decision:reroll", "engine", exclusions)).toBe(false);
  });
});

describe("coverage claims", () => {
  it("derives protocol-command and phase claims from the script", () => {
    const claims = claimsOf(sampleCase());
    expect(claims.has("protocol-command:move")).toBe(true);
    expect(claims.has("phase:PLAY")).toBe(true);
  });

  it("derives rule-config and rule-outcome claims from the source", () => {
    const claims = claimsOf(
      sampleCase({
        source: { kind: "rule-config", id: "dodge-reroll" },
        variants: [
          {
            id: "skill-reroll-offered",
            name: "n",
            seed: 1,
            expectedOutcome: "o",
          },
        ],
      })
    );
    expect(claims.has("rule-config:dodge-reroll")).toBe(true);
    expect(
      claims.has("rule-outcome:dodge-reroll/skill-reroll-offered")
    ).toBe(true);
  });

  it("derives decision claims from a step that answers one", () => {
    const claims = claimsOf(
      sampleCase({
        steps: [step({ type: "use-reroll", accept: true })],
      })
    );
    expect(claims.has("decision:reroll")).toBe(true);
  });

  it("reads decisions and reached phases from an observed run", () => {
    const claims = observedClaims(sampleCase(), {
      layer: "engine",
      initialSnapshot: { phase: GamePhase.PLAY } as never,
      snapshot: { phase: GamePhase.TOUCHDOWN } as never,
      events: [],
      decisions: [{ type: "reroll" } as never],
      responses: [],
    });
    expect(claims).toContain("decision:reroll");
    expect(claims).toContain("phase:PLAY");
    expect(claims).toContain("phase:TOUCHDOWN");
  });
});

describe("coverage report", () => {
  it("never blends engine and visual coverage into one number", () => {
    const result = buildCoverage([sampleCase()], { generatedAt: "t" });
    expect(Object.keys(result.totals).sort()).toEqual([
      "browser",
      "engine",
      "visual",
    ]);
    // A case with engine coverage and no visual checkpoint reports visual as
    // absent, not as partial engine credit.
    expect(result.totals.visual.covered).toBe(0);
    expect(result.totals.engine.covered).toBeGreaterThan(0);
  });

  it("names a missing browser interaction and fails the gate", () => {
    const result = buildCoverage([sampleCase()], { generatedAt: "t" });
    const missingBrowser = result.issues.filter(
      (issue) =>
        issue.kind === "missing-required-coverage" &&
        issue.message.includes("browser")
    );
    expect(missingBrowser.length).toBeGreaterThan(0);
    expect(missingBrowser[0].message).toMatch(/has no browser case/);
  });

  it("flags a synthetic grant that could have used a native fixture", () => {
    const result = buildCoverage(
      [
        sampleCase({
          setup: {
            team1Placements: [
              {
                playerIndex: 0,
                x: 5,
                y: 5,
                skills: [SkillType.BALL_AND_CHAIN],
              },
            ],
            team2Placements: [],
            activeTeam: "team1",
            phase: GamePhase.PLAY,
            subPhase: SubPhase.TURN_RECEIVING,
          },
        }),
      ],
      { generatedAt: "t" }
    );
    expect(
      result.issues.some(
        (issue) => issue.kind === "unexplained-synthetic-grant"
      )
    ).toBe(true);
  });

  it("flags a variant with no committed seed as unreachable", () => {
    const result = buildCoverage(
      [
        sampleCase({
          variants: [
            {
              id: "v",
              name: "V",
              seed: Number.NaN,
              expectedOutcome: "never found",
            },
          ],
        }),
      ],
      { generatedAt: "t" }
    );
    expect(
      result.issues.some((issue) => issue.kind === "unreachable-variant")
    ).toBe(true);
  });

  it("counts an entry as covered when a run observed it", () => {
    const withoutFragment = buildCoverage([sampleCase()], { generatedAt: "t" });
    const withFragment = buildCoverage([sampleCase()], {
      generatedAt: "t",
      fragments: [
        {
          caseId: "sample",
          variantId: "v",
          layer: "engine",
          claims: ["decision:block-dice"],
        },
      ],
    });
    expect(withFragment.totals.engine.covered).toBe(
      withoutFragment.totals.engine.covered + 1
    );
  });

  it("keeps an engine-observed decision out of the browser column", () => {
    // `decision:block-dice` is browser-required and carries no exclusion, so
    // proving it in the engine must leave the browser column empty.
    const result = buildCoverage(
      [sampleCase({ layers: ["engine", "browser"] })],
      {
        generatedAt: "t",
        fragments: [
          {
            caseId: "sample",
            variantId: "v",
            layer: "engine",
            claims: ["decision:block-dice"],
          },
        ],
      }
    );
    const blockDice = result.entries.find(
      (entry) => entry.entry.id === "decision:block-dice"
    )!;
    expect(
      blockDice.layers.find((layer) => layer.layer === "engine")?.status
    ).toBe("covered");
    expect(
      blockDice.layers.find((layer) => layer.layer === "browser")?.status
    ).toBe("missing");
  });

  it("renders a readable report grouped by inventory kind", () => {
    const text = renderCoverageReport(
      buildCoverage([sampleCase()], { generatedAt: "t" })
    );
    expect(text).toContain("E2E coverage");
    expect(text).toContain("engine");
    expect(text).toContain("MISSING");
  });
});

describe("shard merging", () => {
  const shardA = buildCoverage([sampleCase({ id: "a" })], { generatedAt: "t" });
  const shardB = buildCoverage([sampleCase({ id: "b" })], { generatedAt: "t" });

  it("unions coverage without double-counting an entry", () => {
    const merged = mergeCoverageResults([shardA, shardB]);
    expect(merged.entries.length).toBe(shardA.entries.length);
    const move = merged.entries.find(
      (entry) => entry.entry.id === "protocol-command:move"
    )!;
    const engine = move.layers.find((layer) => layer.layer === "engine")!;
    expect(engine.status).toBe("covered");
    expect(engine.cases).toEqual(["a", "b"]);
  });

  it("keeps every case from every shard, once", () => {
    const merged = mergeCoverageResults([shardA, shardB, shardA]);
    expect(merged.cases.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("recomputes totals rather than summing them", () => {
    const merged = mergeCoverageResults([shardA, shardB]);
    expect(merged.totals.engine.required).toBe(
      shardA.totals.engine.required
    );
  });

  it("returns a single result untouched", () => {
    expect(mergeCoverageResults([shardA])).toBe(shardA);
  });
});

describe("the production registry", () => {
  it("every rule-catalog outcome has a committed seed", () => {
    const missing = ruleOutcomesMissingSeeds();
    expect(
      missing,
      `run 'pnpm e2e:seeds' — missing: ${missing
        .map((entry) => `${entry.configId}/${entry.outcomeId}`)
        .join(", ")}`
    ).toEqual([]);
  });

  it("no registered case has a schema, fixture or duplicate-id problem", () => {
    const result = buildCoverage(SCENARIO_CASES, { generatedAt: "t" });
    const blocking = result.issues.filter(
      (issue) => issue.kind !== "missing-required-coverage"
    );
    expect(
      blocking,
      `\n${blocking.map((issue) => `[${issue.kind}] ${issue.message}`).join("\n")}`
    ).toEqual([]);
  });

  it("the Ogre Throw Team-mate case is registered and roster-authentic", () => {
    const ttm = SCENARIO_CASES.find((c) => c.id === "rule-ttm-throw");
    expect(ttm).toBeDefined();
    expect(ttm!.setup.team1Roster).toBe(RosterName.OGRE);
  });
});
