import { describe, expect, it } from "vitest";
import {
  assertEntrantsCompatible,
  checkTeamCompatibility,
  createRosterRuleProfile,
} from "../../src/competition/rosterRules";
import { createMatchedPlayPackage } from "../../src/game/progression/advancementModes";
import { createTeam, RosterName, Team } from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";

function legalHumanTeam(mode?: Team["advancementMode"]): Team {
  const team = createTeam(
    "Legal Eagles",
    RosterName.HUMAN,
    { primary: 0, secondary: 0xffffff },
    50_000,
    600_000,
    mode
  );
  const roster = getRosterByRosterName(RosterName.HUMAN);
  const template = roster.playerTemplates.find((candidate) =>
    candidate.positionName.includes("Lineman")
  )!;
  for (let i = 0; i < 7; i++) {
    team.players.push(createPlayer(template, team.id, i + 1));
    team.treasury -= template.cost;
  }
  return team;
}

describe("competition roster rule profiles", () => {
  it("is always compatible when the competition has no profile (legacy)", () => {
    const team = legalHumanTeam(undefined);
    expect(checkTeamCompatibility(team, undefined)).toEqual({
      compatible: true,
      reasons: [],
    });
  });

  it("refuses a team with no chosen advancement mode", () => {
    const team = legalHumanTeam(undefined);
    const profile = createRosterRuleProfile({ advancementMode: "advanced-league" });
    const result = checkTeamCompatibility(team, profile);
    expect(result.compatible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/has not chosen/);
  });

  it("refuses a mismatched advancement mode", () => {
    const team = legalHumanTeam("sevens-skill-selection");
    const profile = createRosterRuleProfile({ advancementMode: "advanced-league" });
    const result = checkTeamCompatibility(team, profile);
    expect(result.compatible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/mismatch/);
  });

  it("accepts a legal team matching every rule in the profile", () => {
    const team = legalHumanTeam("advanced-league");
    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: 2_000_000,
    });
    const result = checkTeamCompatibility(team, profile);
    expect(result).toEqual({ compatible: true, reasons: [] });
  });

  it("reports both an advancement-mode mismatch and an exceeded budget together", () => {
    const team = legalHumanTeam("sevens-skill-selection");
    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: 1,
    });
    const result = checkTeamCompatibility(team, profile);
    expect(result.compatible).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });

  it("requires an incomplete Matched Play package to be finished before entry", () => {
    const team = legalHumanTeam("matched-play");
    const pkg = createMatchedPlayPackage({ tierAllowance: { 2: 2 } });
    const profile = createRosterRuleProfile({
      advancementMode: "matched-play",
      matchedPlayPackage: pkg,
      draftBudget: 5_000_000,
    });
    const result = checkTeamCompatibility(team, profile);
    expect(result.compatible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/package incomplete/);
  });

  it("blocks entry while the team has unresolved pending development", () => {
    const team = legalHumanTeam("advanced-league");
    team.pendingDevelopment = [
      {
        id: "p1",
        kind: "advanced-league-advancement",
        playerId: team.players[0].id,
        createdAt: 0,
      },
    ];
    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: 5_000_000,
    });
    const result = checkTeamCompatibility(team, profile);
    expect(result.compatible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/unresolved development/);
  });

  it("rejects a forged/bypassed incompatible entry at the authoritative gate", () => {
    const team = legalHumanTeam("sevens-skill-selection");
    const profile = createRosterRuleProfile({ advancementMode: "advanced-league" });
    expect(() => assertEntrantsCompatible([team], profile)).toThrow(
      /not compatible/
    );
  });

  it("lets the authoritative gate pass a compatible entrant through untouched", () => {
    const team = legalHumanTeam("advanced-league");
    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: 5_000_000,
    });
    expect(() => assertEntrantsCompatible([team], profile)).not.toThrow();
  });
});
