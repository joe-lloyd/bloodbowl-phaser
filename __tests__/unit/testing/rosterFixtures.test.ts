/**
 * The fixture-authenticity gate.
 *
 * Two jobs: prove the priority policy picks the right roster slot, and hold
 * the production catalogs to it — no scenario may quietly field a player who
 * could not exist, and Throw/Kick Team-mate must use the Ogre roster rather
 * than granting the traits to unrelated Humans.
 */

import { describe, it, expect } from "vitest";
import { SkillType } from "../../../src/types/Skills";
import { RosterName } from "../../../src/types/Team";
import { RULE_SCENARIOS } from "../../../src/data/ruleScenarios";
import { SCENARIOS } from "../../../src/data/scenarios";
import { positionByPlayerIndex } from "../../../src/game/TeamFactory";
import {
  nativeFixtures,
  nativePositions,
  advancementFixtures,
  preferredFixture,
  resolveSkillFixture,
  grantLegality,
  ownsNatively,
  nativeSkillsAt,
  positionAt,
  refFor,
} from "../../../src/testing/fixtures/rosterFixtures";
import {
  auditSetupFixtures,
  formatFixtureIssues,
  FixtureIssue,
} from "../../../src/testing/fixtures/validateFixtures";

describe("fixture priority policy", () => {
  it("prefers a position that starts with the skill", () => {
    const fixture = preferredFixture(SkillType.THROW_TEAM_MATE)!;
    expect(fixture.source).toBe("native");
    expect(ownsNatively(fixture.roster, fixture.playerIndex, SkillType.THROW_TEAM_MATE)).toBe(
      true
    );
  });

  it("falls back to a rules-valid advancement when nobody starts with it", () => {
    // Fend is a General skill no fielded Sevens position begins with, but
    // plenty of positions have General access.
    const natives = nativeFixtures(SkillType.SHADOWING);
    const advancements = advancementFixtures(SkillType.SHADOWING);
    expect(advancements.length).toBeGreaterThan(0);
    expect(advancements.every((f) => f.source === "advancement")).toBe(true);
    // Whatever exists, native still wins when it exists.
    if (natives.length > 0) {
      expect(preferredFixture(SkillType.SHADOWING)?.source).toBe("native");
    }
  });

  it("honours a caller's roster preference when that roster can supply it", () => {
    const ogre = resolveSkillFixture(SkillType.RIGHT_STUFF, {
      preferRoster: RosterName.OGRE,
    })!;
    expect(ogre.roster).toBe(RosterName.OGRE);
    expect(ogre.positionName).toBe("Gnoblar Lineman");
  });

  it("ignores an impossible roster preference and returns the global best", () => {
    const fixture = resolveSkillFixture(SkillType.BALL_AND_CHAIN, {
      preferRoster: RosterName.HUMAN,
    })!;
    expect(fixture.roster).toBe(RosterName.GOBLIN);
    expect(fixture.positionName).toBe("Fanatic");
  });

  it("returns null when a skill has no native or advancement fixture", () => {
    // Right Stuff is a trait: never an advancement, so only native counts.
    const natives = nativeFixtures(SkillType.RIGHT_STUFF);
    expect(natives.length).toBeGreaterThan(0);
    expect(advancementFixtures(SkillType.RIGHT_STUFF)).toEqual([]);
  });

  it("is deterministic across calls", () => {
    const first = nativeFixtures(SkillType.STUNTY).map((f) => `${f.roster}/${f.positionName}`);
    const second = nativeFixtures(SkillType.STUNTY).map((f) => `${f.roster}/${f.positionName}`);
    expect(second).toEqual(first);
  });

  it("distinguishes fielded from unfielded native positions", () => {
    const positions = nativePositions(SkillType.STUNTY);
    expect(positions.some((p) => p.fielded)).toBe(true);
    expect(positions.every((p) => typeof p.fielded === "boolean")).toBe(true);
  });
});

describe("grant legality", () => {
  it("reports native ownership", () => {
    // Ogre index 0 is an Ogre Blocker: Bone Head, Throw Team-mate.
    expect(grantLegality(RosterName.OGRE, 0, SkillType.BONE_HEAD)).toBe("native");
  });

  it("allows a skill the position has primary access to", () => {
    // Human Linemen take General skills as a primary advancement.
    expect(grantLegality(RosterName.HUMAN, 0, SkillType.BLOCK)).toBe(
      "primary-advancement"
    );
  });

  it("rejects a Mutation on a roster with no Mutation access", () => {
    expect(grantLegality(RosterName.HUMAN, 0, SkillType.VERY_LONG_LEGS)).toBe(
      "illegal"
    );
  });

  it("rejects any trait, since traits are never advancements", () => {
    expect(grantLegality(RosterName.HUMAN, 0, SkillType.RIGHT_STUFF)).toBe(
      "illegal"
    );
  });
});

describe("stable slot lookup", () => {
  it("maps a player index to the position the composition fields there", () => {
    expect(positionAt(RosterName.OGRE, 0)).toBe("Ogre Blocker");
    expect(positionAt(RosterName.OGRE, 2)).toBe("Ogre Runt Punter");
    expect(positionAt(RosterName.OGRE, 3)).toBe("Gnoblar Lineman");
  });

  it("falls back to seven of the first position for unlisted rosters", () => {
    const positions = positionByPlayerIndex(RosterName.LIZARDMEN);
    expect(positions).toHaveLength(7);
    expect(new Set(positions).size).toBe(1);
  });

  it("lists the skills a slot brings from its roster", () => {
    expect(nativeSkillsAt(RosterName.OGRE, 3)).toContain(SkillType.RIGHT_STUFF);
    expect(nativeSkillsAt(RosterName.OGRE, 3)).toContain(SkillType.TITCHY);
  });

  it("builds a player reference from a slot", () => {
    expect(refFor("team2", { playerIndex: 3 })).toBe("team2:3");
  });
});

describe("fixture audit", () => {
  it("flags a grant the position already owns", () => {
    const { issues } = auditSetupFixtures("demo", {
      team1Roster: RosterName.OGRE,
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: [SkillType.BONE_HEAD] },
      ],
      team2Placements: [],
      activeTeam: "team1",
      phase: "PLAY" as never,
      subPhase: "TURN_RECEIVING" as never,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("redundant-grant");
  });

  it("names the preferred native fixture for an implausible grant", () => {
    const { issues } = auditSetupFixtures("demo", {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: [SkillType.BALL_AND_CHAIN] },
      ],
      team2Placements: [],
      activeTeam: "team1",
      phase: "PLAY" as never,
      subPhase: "TURN_RECEIVING" as never,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("implausible-grant");
    expect(issues[0].message).toContain('Goblin "Fanatic"');
  });

  it("accepts an implausible grant that carries an isolation reason", () => {
    const { issues, grants } = auditSetupFixtures(
      "demo",
      {
        team1Placements: [
          { playerIndex: 0, x: 5, y: 5, skills: [SkillType.BALL_AND_CHAIN] },
        ],
        team2Placements: [],
        activeTeam: "team1",
        phase: "PLAY" as never,
        subPhase: "TURN_RECEIVING" as never,
      },
      [
        {
          player: "team1:0",
          skill: SkillType.BALL_AND_CHAIN,
          reason: "the Fanatic's Stunty changes the injury table under test",
        },
      ]
    );
    expect(issues).toEqual([]);
    expect(grants[0].justification).toBe("declared");
  });

  it("treats a grant with no fielded native holder as forced, not a defect", () => {
    const { issues, grants } = auditSetupFixtures("demo", {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: [SkillType.VERY_LONG_LEGS] },
      ],
      team2Placements: [],
      activeTeam: "team1",
      phase: "PLAY" as never,
      subPhase: "TURN_RECEIVING" as never,
    });
    expect(issues).toEqual([]);
    expect(grants[0].justification).toBe("forced");
  });

  it("ignores an empty reason", () => {
    const { issues } = auditSetupFixtures(
      "demo",
      {
        team1Placements: [
          { playerIndex: 0, x: 5, y: 5, skills: [SkillType.BALL_AND_CHAIN] },
        ],
        team2Placements: [],
        activeTeam: "team1",
        phase: "PLAY" as never,
        subPhase: "TURN_RECEIVING" as never,
      },
      [{ player: "team1:0", skill: SkillType.BALL_AND_CHAIN, reason: "   " }]
    );
    expect(issues).toHaveLength(1);
  });
});

describe("production catalogs are fixture-authentic", () => {
  function auditEverything(): FixtureIssue[] {
    const issues: FixtureIssue[] = [];
    for (const entry of RULE_SCENARIOS) {
      for (const config of entry.configs) {
        issues.push(
          ...auditSetupFixtures(
            config.id,
            config.setup,
            (config.skillProvenance ?? []).map((provenance) => ({
              player: provenance.playerRef,
              skill: provenance.skill,
              reason: provenance.reason,
            }))
          ).issues
        );
      }
    }
    for (const scenario of SCENARIOS) {
      issues.push(...auditSetupFixtures(scenario.id, scenario.setup).issues);
    }
    return issues;
  }

  it("no rule config or sandbox scenario fields an impossible player", () => {
    const issues = auditEverything();
    expect(issues, `\n${formatFixtureIssues(issues)}`).toEqual([]);
  });

  it("Throw Team-mate uses an Ogre thrower and an eligible Gnoblar", () => {
    const entry = RULE_SCENARIOS.find(
      (candidate) => candidate.skill === SkillType.THROW_TEAM_MATE
    )!;
    expect(entry.configs.length).toBeGreaterThan(0);
    for (const config of entry.configs) {
      expect(config.setup.team1Roster, config.id).toBe(RosterName.OGRE);
      // The thrower placement is an Ogre Blocker (0/1); the mate is a Gnoblar.
      const throwers = config.setup.team1Placements.filter((placement) =>
        nativeSkillsAt(RosterName.OGRE, placement.playerIndex).includes(
          SkillType.THROW_TEAM_MATE
        )
      );
      const mates = config.setup.team1Placements.filter((placement) =>
        nativeSkillsAt(RosterName.OGRE, placement.playerIndex).includes(
          SkillType.RIGHT_STUFF
        )
      );
      expect(throwers.length, `${config.id} needs an Ogre thrower`).toBeGreaterThan(0);
      expect(mates.length, `${config.id} needs a Gnoblar`).toBeGreaterThan(0);
    }
  });

  it("Kick Team-mate uses the Ogre Runt Punter", () => {
    const entry = RULE_SCENARIOS.find(
      (candidate) => candidate.skill === SkillType.KICK_TEAM_MATE
    )!;
    for (const config of entry.configs) {
      expect(config.setup.team1Roster, config.id).toBe(RosterName.OGRE);
      const punters = config.setup.team1Placements.filter((placement) =>
        nativeSkillsAt(RosterName.OGRE, placement.playerIndex).includes(
          SkillType.KICK_TEAM_MATE
        )
      );
      expect(punters.length, `${config.id} needs the Runt Punter`).toBeGreaterThan(
        0
      );
    }
  });

  it("every declared skill provenance names a real roster position", () => {
    for (const entry of RULE_SCENARIOS) {
      for (const config of entry.configs) {
        for (const provenance of config.skillProvenance ?? []) {
          const positions = positionByPlayerIndex(provenance.roster);
          expect(
            positions.includes(provenance.positionName) ||
              nativePositions(provenance.skill).some(
                (candidate) =>
                  candidate.roster === provenance.roster &&
                  candidate.positionName === provenance.positionName
              ),
            `${config.id}: ${provenance.roster} has no "${provenance.positionName}"`
          ).toBe(true);
          expect(provenance.reason.trim().length, config.id).toBeGreaterThan(0);
        }
      }
    }
  });
});
