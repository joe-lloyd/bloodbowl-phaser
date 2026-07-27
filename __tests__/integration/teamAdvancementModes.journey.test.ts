/**
 * End-to-end journeys for the three team advancement modes: team creation
 * through competition entry and post-match management.
 *
 * Deviation note: proposal task 6.3 calls for "seeded headless Playwright
 * journeys". This branch/worktree has no Playwright installation or e2e/
 * harness (it lives on a separate, unmerged branch) — see the
 * add-team-advancement-modes PR description. These integration tests drive
 * the same service-level code paths the UI calls (TeamManager,
 * MatchStats, advancementModes, rosterRules) end-to-end instead, which is
 * the closest equivalent available in this repo today.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import {
  getTeamById,
  loadTeams,
  saveTeam,
} from "../../src/game/managers/TeamManager";
import {
  createTeam,
  lockAdvancementMode,
  RosterName,
  setAdvancementMode,
  Team,
  calculateTeamValue,
} from "../../src/types/Team";
import { createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { MatchStats } from "../../src/game/progression/MatchStats";
import { GameEventNames } from "../../src/types/events";
import {
  allocateMatchedPlaySkill,
  confirmSkillSelectionAward,
  createMatchedPlayPackage,
  createPendingSkillSelection,
  eligibleSkillSelectionParticipants,
  matchedPlayPackageStatus,
  resolveDraft,
} from "../../src/game/progression/advancementModes";
import {
  checkTeamCompatibility,
  createRosterRuleProfile,
} from "../../src/competition/rosterRules";
import { applyAdvancement, mustAdvance } from "../../src/game/progression/progression";
import { SkillType } from "../../src/types/Skills";

function buildLegalTeam(name: string, mode: Team["advancementMode"]): Team {
  const team = createTeam(
    name,
    RosterName.HUMAN,
    { primary: 0x123456, secondary: 0x654321 },
    50_000,
    600_000,
    mode
  );
  const roster = getRosterByRosterName(RosterName.HUMAN);
  const lineman = roster.playerTemplates.find((t) =>
    t.positionName.includes("Lineman")
  )!;
  for (let i = 0; i < 7; i++) {
    const player = createPlayer(lineman, team.id, i + 1);
    team.players.push(player);
    team.treasury -= lineman.cost;
  }
  team.teamValue = calculateTeamValue(team);
  return team;
}

beforeEach(() => {
  localStorage.clear();
});

describe("Advanced League journey", () => {
  it("earns SPP, requires a forced advancement in Manage Team, then re-enters a compatible competition", () => {
    const team = buildLegalTeam("AL Team", "advanced-league");
    lockAdvancementMode(team);
    saveTeam(team);

    // Mode is immutable once locked.
    expect(() => setAdvancementMode(team, "matched-play")).toThrow(/immutable/);

    // Simulate a match: the scorer racks up enough SPP to force advancement.
    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [team, opponent], true);
    const scorer = team.players[0];
    for (let i = 0; i < 5; i++) {
      bus.emit(GameEventNames.Touchdown, { teamId: team.id, score: 1, scorerId: scorer.id });
    }
    tracker.applySpp([team, opponent]);
    expect(scorer.spp).toBe(15); // 5 touchdowns * 3 SPP
    expect(mustAdvance(scorer)).toBe(true); // >= 14 (characteristic cost for adv #1)

    // Post-match would record pending development (see MatchResultsScreen);
    // simulate that directly here.
    team.pendingDevelopment = [
      {
        id: "pending-1",
        kind: "advanced-league-advancement",
        playerId: scorer.id,
        createdAt: Date.now(),
      },
    ];
    saveTeam(team);

    // Competition entry is refused while development is pending.
    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: 5_000_000,
    });
    let compatibility = checkTeamCompatibility(getTeamById(team.id)!, profile);
    expect(compatibility.compatible).toBe(false);
    expect(compatibility.reasons.join(" ")).toMatch(/unresolved development/);

    // Coach resolves it from Manage Team (Random Primary, an eligible skill).
    const legal = [SkillType.BLOCK, SkillType.DODGE, SkillType.TACKLE].find(
      (candidate) => !scorer.skills.some((s) => s.type === candidate)
    )!;
    applyAdvancement(scorer, { kind: "chosen-primary", skill: legal });
    team.pendingDevelopment = [];
    saveTeam(team);

    compatibility = checkTeamCompatibility(getTeamById(team.id)!, profile);
    expect(compatibility.compatible).toBe(true);
  });
});

describe("Matched Play journey", () => {
  it("allocates the event package, blocks entry until complete, then accepts the team", () => {
    const team = buildLegalTeam("MP Team", "matched-play");
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const pkg = createMatchedPlayPackage({
      tierAllowance: { [roster.tier]: 2 },
      secondaryAllowance: { [roster.tier]: 1 },
    });
    const profile = createRosterRuleProfile({
      advancementMode: "matched-play",
      matchedPlayPackage: pkg,
      draftBudget: 5_000_000,
    });

    let compatibility = checkTeamCompatibility(team, profile);
    expect(compatibility.compatible).toBe(false);
    expect(compatibility.reasons.join(" ")).toMatch(/package incomplete/);

    allocateMatchedPlaySkill(team, roster, pkg, team.players[0], SkillType.BLOCK, "primary");
    allocateMatchedPlaySkill(team, roster, pkg, team.players[1], SkillType.GUARD, "secondary");
    team.teamValue = calculateTeamValue(team);
    expect(matchedPlayPackageStatus(team, roster, pkg).complete).toBe(true);

    lockAdvancementMode(team);
    saveTeam(team);

    compatibility = checkTeamCompatibility(getTeamById(team.id)!, profile);
    expect(compatibility.compatible).toBe(true);

    // Matched Play players never earn SPP from match play.
    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [team, opponent], true);
    bus.emit(GameEventNames.Touchdown, {
      teamId: team.id,
      score: 1,
      scorerId: team.players[0].id,
    });
    tracker.applySpp([team, opponent]);
    expect(team.players[0].spp).toBe(0);
  });
});

describe("Sevens Skill Selection journey", () => {
  it("plays a match with no SPP, resolves the pending award, and runs the Draft", () => {
    const team = buildLegalTeam("SS Team", "sevens-skill-selection");
    lockAdvancementMode(team);
    saveTeam(team);

    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [team, opponent], true);
    const [p1, p2, p3] = team.players;
    bus.emit(GameEventNames.PlayerActivated, p1.id);
    bus.emit(GameEventNames.PlayerActivated, p2.id);
    bus.emit(GameEventNames.PlayerActivated, p3.id);
    bus.emit(GameEventNames.Touchdown, { teamId: team.id, score: 1, scorerId: p1.id });
    const summary = tracker.applySpp([team, opponent]);
    expect(p1.spp).toBe(0); // no SPP for this mode, even after a touchdown

    // Post-match: freeze eligible participants and create the pending award.
    const participantIds = summary.players
      .filter((s) => s.teamId === team.id && s.participated)
      .map((s) => s.playerId);
    const eligible = eligibleSkillSelectionParticipants(team, participantIds);
    expect(eligible.sort()).toEqual([p1.id, p2.id, p3.id].sort());
    createPendingSkillSelection(team, "match-1", eligible);
    saveTeam(team);
    expect(getTeamById(team.id)!.pendingDevelopment).toHaveLength(1);

    // Manage Team: coach picks p1 for a Primary award (two random rolls
    // would normally be offered; confirm one directly here).
    confirmSkillSelectionAward(p1, SkillType.BLOCK, "primary", "match-1");
    team.pendingDevelopment = [];
    team.teamValue = calculateTeamValue(team);

    // The post-game Draft then rolls for every player with added skills.
    // p1 has 1 added skill; a roll of 1 drafts them, anything else keeps them.
    const fixedRng = { rollDie: () => 6 }; // never drafted at this roll
    const outcome = resolveDraft(team, fixedRng, "match-1");
    expect(outcome.records).toHaveLength(0);
    expect(team.players).toHaveLength(7);
    saveTeam(team);

    const profile = createRosterRuleProfile({
      advancementMode: "sevens-skill-selection",
      draftBudget: 5_000_000,
    });
    expect(checkTeamCompatibility(getTeamById(team.id)!, profile).compatible).toBe(
      true
    );
  });

  it("drafts an experienced player away and credits exact compensation", () => {
    const team = buildLegalTeam("SS Team 2", "sevens-skill-selection");
    const p1 = team.players[0];
    confirmSkillSelectionAward(p1, SkillType.BLOCK, "primary", "m1"); // 30k elite
    const rollOne = { rollDie: () => 1 }; // always <= addedSkillCount(1) -> drafted
    const outcome = resolveDraft(team, rollOne, "m2");
    expect(outcome.records).toHaveLength(1);
    expect(outcome.goldCredited).toBe(30_000);
    expect(team.players.find((p) => p.id === p1.id)).toBeUndefined();
    expect(team.draftHistory).toHaveLength(1);
  });
});

describe("Save/resume and cloud persistence round-trip", () => {
  it("preserves advancement mode, pending development, allocations and Draft history through a JSON round trip", () => {
    const team = buildLegalTeam("Cloud Team", "sevens-skill-selection");
    lockAdvancementMode(team);
    createPendingSkillSelection(team, "match-9", [team.players[0].id]);
    confirmSkillSelectionAward(team.players[1], SkillType.GUARD, "secondary", "m0");
    saveTeam(team);

    // Simulate what CloudTeamRepository.saveTeams/loadTeams and Firestore's
    // setDoc do to a team document: a plain JSON round trip.
    const roundTripped = JSON.parse(JSON.stringify(getTeamById(team.id)));

    expect(roundTripped.advancementMode).toBe("sevens-skill-selection");
    expect(roundTripped.advancementModeLocked).toBe(true);
    expect(roundTripped.pendingDevelopment).toHaveLength(1);
    expect(roundTripped.pendingDevelopment[0].eligibleParticipantIds).toEqual([
      team.players[0].id,
    ]);
    expect(
      roundTripped.players[1].advancements.some(
        (a: { name: string }) => a.name === SkillType.GUARD
      )
    ).toBe(true);
  });
});

describe("legacy (unmigrated) teams", () => {
  it("keeps earning SPP by default until the coach picks a mode", () => {
    const legacy = createTeam(
      "Legacy",
      RosterName.HUMAN,
      { primary: 0, secondary: 0 },
      50_000
    );
    // No advancementMode set (as if this team predates the feature).
    expect(legacy.advancementMode).toBeUndefined();
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const lineman = roster.playerTemplates.find((t) =>
      t.positionName.includes("Lineman")
    )!;
    legacy.players.push(createPlayer(lineman, legacy.id, 1));

    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [legacy, opponent], true);
    bus.emit(GameEventNames.Touchdown, {
      teamId: legacy.id,
      score: 1,
      scorerId: legacy.players[0].id,
    });
    tracker.applySpp([legacy, opponent]);
    expect(legacy.players[0].spp).toBe(3); // unchanged legacy behavior

    // But it cannot enter a mode-gated competition until it chooses one.
    const profile = createRosterRuleProfile({ advancementMode: "advanced-league" });
    expect(checkTeamCompatibility(legacy, profile).compatible).toBe(false);
  });

  it("auto-migrates a legacy team with SPP history to Advanced League on load", () => {
    const legacy = createTeam(
      "Legacy With History",
      RosterName.HUMAN,
      { primary: 0, secondary: 0 },
      50_000
    );
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const lineman = roster.playerTemplates.find((t) =>
      t.positionName.includes("Lineman")
    )!;
    const player = createPlayer(lineman, legacy.id, 1);
    player.spp = 5;
    legacy.players.push(player);
    saveTeam(legacy);

    const reloaded = loadTeams().find((t) => t.id === legacy.id)!;
    expect(reloaded.advancementMode).toBe("advanced-league");
    expect(reloaded.advancementModeLocked).toBe(true);
  });
});
