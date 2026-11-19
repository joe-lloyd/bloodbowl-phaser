import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { SkillType } from "../../../src/types/Skills";
import { SkillRegistry } from "../../../src/game/skills";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { RULE_CASES, SCENARIO_CASES } from "../../../src/testing/cases";
import { ruleCaseId } from "../../../src/testing/cases/fromRuleConfigs";
import { validateScenarioCases } from "../../../src/testing/scenarioCase";
import { nativeSkillsAt } from "../../../src/testing/fixtures/rosterFixtures";
import { RosterName } from "../../../src/types/Team";

const configIds = new Set(
  RULE_SCENARIOS.flatMap((entry) => entry.configs.map((config) => config.id))
);

describe("generated rule cases", () => {
  it("every catalog configuration became a scenario case", () => {
    const generated = new Set(RULE_CASES.map((entry) => entry.id));
    for (const configId of configIds) {
      expect(generated.has(ruleCaseId(configId)), configId).toBe(true);
    }
    expect(generated.size).toBe(configIds.size);
  });

  it("every declared outcome became a named variant with a committed seed", () => {
    for (const entry of RULE_SCENARIOS) {
      for (const config of entry.configs) {
        const scenarioCase = fixtureValue(RULE_CASES.find(
          (candidate) => candidate.id === ruleCaseId(config.id)
        ));
        expect(
          scenarioCase.variants.map((v) => v.id).sort(),
          config.id
        ).toEqual(config.outcomes.map((o) => o.id).sort());
        for (const variant of scenarioCase.variants) {
          expect(
            Number.isInteger(variant.seed),
            `${config.id}/${variant.id} has no committed seed — run 'pnpm e2e:seeds'`
          ).toBe(true);
        }
      }
    }
  });

  it("the generated cases are schema-valid", () => {
    expect(validateScenarioCases(RULE_CASES)).toEqual([]);
  });

  it("every implemented rule has at least one case", () => {
    const implemented = (Object.values(SkillType)).filter(
      (type) => SkillRegistry.has(type)
    );
    const covered = new Set(RULE_SCENARIOS.map((entry) => entry.skill));
    expect(implemented.filter((type) => !covered.has(type))).toEqual([]);
  });
});

describe("decision paths are exercised", () => {
  function configsTouching(predicate: (source: string) => boolean): string[] {
    return RULE_SCENARIOS.flatMap((entry) =>
      entry.configs
        .filter((config) => {
          const source =
            JSON.stringify(config.script ?? []) +
            JSON.stringify(config.decisionPolicy ?? {}) +
            (config.decisionPolicy?.custom?.toString() ?? "");
          return predicate(source);
        })
        .map((config) => config.id)
    );
  }

  it("covers accepting and declining a re-roll", () => {
    const declines = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter(
        (config) => config.decisionPolicy?.acceptRerolls === false
      )
    );
    expect(declines.length).toBeGreaterThan(0);

    const accepts = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter(
        (config) => config.decisionPolicy?.acceptRerolls === undefined
      )
    );
    expect(accepts.length).toBeGreaterThan(0);
  });

  it("covers choosing a specific re-roll source", () => {
    const sourced = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter(
        (config) => typeof config.decisionPolicy?.acceptRerolls === "string"
      )
    );
    expect(sourced.map((config) => config.id).length).toBeGreaterThan(0);
  });

  it("covers a reacting coach both accepting and declining", () => {
    const declines = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter(
        (config) => config.decisionPolicy?.acceptReactions === false
      )
    );
    const accepts = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter(
        (config) => config.decisionPolicy?.acceptReactions === true
      )
    );
    expect(declines.length, "no config declines a reaction").toBeGreaterThan(0);
    expect(accepts.length, "no config accepts a reaction").toBeGreaterThan(0);
  });

  it("covers declining an interception", () => {
    const declines = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter(
        (config) => config.decisionPolicy?.acceptInterceptions === false
      )
    );
    expect(declines.length).toBeGreaterThan(0);
  });

  it("covers refusing and taking a follow-up", () => {
    const refuses = configsTouching((source) =>
      source.includes('"followUp":false')
    );
    expect(refuses.length).toBeGreaterThan(0);
  });

  it("covers a once-per-turn limit being consumed", () => {
    const ids = [...configIds];
    expect(ids.some((id) => id.includes("blitz"))).toBe(true);
    expect(ids.some((id) => id.includes("foul"))).toBe(true);
  });

  it("covers a parameterised skill's value", () => {
    const parameterised = RULE_SCENARIOS.flatMap((entry) =>
      entry.configs.filter((config) =>
        [...config.setup.team1Placements, ...config.setup.team2Placements].some(
          (placement) =>
            (placement.skills ?? []).some(
              (skill) => typeof skill === "object" && "parameter" in skill
            )
        )
      )
    );
    expect(parameterised.length).toBeGreaterThan(0);
  });
});

describe("special actions use real roster players", () => {
  const specialActions: { skill: SkillType; roster: RosterName }[] = [
    { skill: SkillType.THROW_TEAM_MATE, roster: RosterName.OGRE },
    { skill: SkillType.KICK_TEAM_MATE, roster: RosterName.OGRE },
    { skill: SkillType.BOMBARDIER, roster: RosterName.GOBLIN },
    { skill: SkillType.CHAINSAW, roster: RosterName.GOBLIN },
    { skill: SkillType.BALL_AND_CHAIN, roster: RosterName.GOBLIN },
    { skill: SkillType.SECRET_WEAPON, roster: RosterName.GOBLIN },
    { skill: SkillType.STAB, roster: RosterName.DARK_ELF },
  ];

  for (const { skill, roster } of specialActions) {
    it(`${skill} is demonstrated by a ${roster} roster player`, () => {
      const entry = RULE_SCENARIOS.find(
        (candidate) => candidate.skill === skill
      );
      expect(entry, `${skill} has no catalog entry`).toBeDefined();

      const authentic = fixtureValue(entry).configs.some((config) => {
        const sides = [
          {
            roster: config.setup.team1Roster,
            placements: config.setup.team1Placements,
          },
          {
            roster: config.setup.team2Roster,
            placements: config.setup.team2Placements,
          },
        ];
        return sides.some(
          (side) =>
            side.roster !== undefined &&
            side.placements.some((placement) =>
              nativeSkillsAt(fixtureValue(side.roster), placement.playerIndex).includes(
                skill
              )
            )
        );
      });
      expect(
        authentic,
        `no ${skill} config fields a player with it natively`
      ).toBe(true);
    });
  }

  it("fouls are demonstrated by the Devious catalog", () => {
    const foulish = [...configIds].filter(
      (id) =>
        id.includes("foul") ||
        id.includes("dirty-player") ||
        id.includes("sneaky-git") ||
        id.includes("boot-in")
    );
    expect(foulish.length).toBeGreaterThan(0);
  });
});

describe("book-linked skill pairs prove both directions", () => {
  const pairs: { name: string; applies: string; suppressed: string }[] = [
    {
      name: "Dodge vs Tackle",
      applies: "dodge-reroll",
      suppressed: "tackle-denies-dodge-reroll",
    },
    {
      name: "Dodge's Stumble vs Tackle",
      applies: "dodge-stumble-becomes-push",
      suppressed: "tackle-cancels-stumble",
    },
    {
      name: "Sidestep vs Grab",
      applies: "sidestep-picks-square",
      suppressed: "sidestep-cancelled-by-grab",
    },
    {
      name: "Guard vs Defensive",
      applies: "guard-marked-assist",
      suppressed: "defensive-cancels-guard",
    },
    {
      name: "Mighty Blow vs Iron Hard Skin",
      applies: "mighty-blow-pow",
      suppressed: "iron-hard-skin-vs-mighty-blow",
    },
    {
      name: "Stunty injury table vs Thick Skull",
      applies: "stunty-injury-table",
      suppressed: "stunty-thick-skull",
    },
    {
      name: "Stand Firm accepted vs declined",
      applies: "stand-firm-accepted",
      suppressed: "stand-firm-declined",
    },
    {
      name: "Pro vs other re-roll sources",
      applies: "pro-die-reroll",
      suppressed: "pro-locks-out-other-rerolls",
    },
  ];

  for (const pair of pairs) {
    it(`${pair.name}: both the applying and the suppressed outcome exist`, () => {
      expect(configIds.has(pair.applies), pair.applies).toBe(true);
      expect(configIds.has(pair.suppressed), pair.suppressed).toBe(true);

      for (const configId of [pair.applies, pair.suppressed]) {
        const scenarioCase = SCENARIO_CASES.find(
          (candidate) => candidate.id === ruleCaseId(configId)
        );
        expect(
          scenarioCase,
          `${configId} is not a registered case`
        ).toBeDefined();
        expect(fixtureValue(scenarioCase).variants.length).toBeGreaterThan(0);
      }
    });
  }
});
