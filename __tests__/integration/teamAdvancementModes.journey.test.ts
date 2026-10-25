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
  createPendingSkillSelection,
  eligibleSkillSelectionPlayers,
  keepDraftedPlayer,
  matchedPlaySkillStatus,
  nominatePrimarySkill,
  releaseDraftedPlayer,
  rollPrimarySelection,
  skillSelectionDecision,
  startPrimarySelection,
} from "../../src/game/progression/advancementModes";
import {
  checkTeamCompatibility,
  createRosterRuleProfile,
} from "../../src/competition/rosterRules";
import { applyAdvancement, mustAdvance } from "../../src/game/progression/progression";
import { SkillCategory, SkillType } from "../../src/types/Skills";
import { chooseVeteran } from "../../src/game/rules/veteran";

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
  chooseVeteran(team, team.players[0].id);
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
  it("spends the tier's Skill Points, then plays without earning SPP", () => {
    const team = buildLegalTeam("MP Team", "matched-play");
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const profile = createRosterRuleProfile({
      advancementMode: "matched-play",
      draftBudget: 5_000_000,
    });

    const valueBefore = calculateTeamValue(team);
    allocateMatchedPlaySkill(team, roster, team.players[0], SkillType.BLOCK, "primary");
    expect(matchedPlaySkillStatus(team, roster)).toMatchObject({
      points: 1,
      remaining: 0,
    });
    expect(calculateTeamValue(team)).toBe(valueBefore);

    lockAdvancementMode(team);
    saveTeam(team);
    expect(checkTeamCompatibility(getTeamById(team.id)!, profile).compatible).toBe(
      true
    );

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
    const [p1] = team.players;
    bus.emit(GameEventNames.PlayerActivated, p1.id);
    bus.emit(GameEventNames.Touchdown, { teamId: team.id, score: 1, scorerId: p1.id });
    tracker.applySpp([team, opponent]);
    expect(p1.spp).toBe(0); // no SPP for this mode, even after a touchdown

    // Post-match: freeze the players who did not end as a Casualty.
    const eligible = eligibleSkillSelectionPlayers(team);
    expect(eligible).toHaveLength(7);
    createPendingSkillSelection(team, "match-1", eligible);
    saveTeam(team);
    expect(getTeamById(team.id)!.pendingDevelopment).toHaveLength(1);

    // Manage Team: the coach takes the Primary route for p1; the coaches
    // name three General skills in turn and a D3 picks one.
    const [entry] = team.pendingDevelopment!;
    if (entry.kind !== "sevens-skill-selection") throw new Error(entry.kind);
    expect(skillSelectionDecision(team, entry).type).toBe("choose-route");
    startPrimarySelection(team, entry, p1.id, SkillCategory.GENERAL);
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    const result = rollPrimarySelection(team, entry, { rollDie: () => 3 });
    expect(result.skill).toBe(SkillType.TACKLE);
    // p1 has one added skill, so the Draft D6 of 3 makes no offer.
    expect(result.draft).toEqual({ offers: [], released: [] });
    expect(team.pendingDevelopment).toEqual([]);
    saveTeam(team);

    const profile = createRosterRuleProfile({
      advancementMode: "sevens-skill-selection",
      draftBudget: 5_000_000,
    });
    expect(checkTeamCompatibility(getTeamById(team.id)!, profile).compatible).toBe(
      true
    );
  });

  it("keeps the 15,000 value rise of a player the coach paid to keep after a reload", () => {
    const team = buildLegalTeam("SS Team 3", "sevens-skill-selection");
    const p1 = team.players[0];
    createPendingSkillSelection(team, "m1", [p1.id]);
    const [entry] = team.pendingDevelopment!;
    if (entry.kind !== "sevens-skill-selection") throw new Error(entry.kind);
    startPrimarySelection(team, entry, p1.id, SkillCategory.GENERAL);
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    const result = rollPrimarySelection(team, entry, { rollDie: () => 1 });
    keepDraftedPlayer(team, result.draft.offers[0]);
    saveTeam(team);

    const reloaded = getTeamById(team.id)!.players.find((p) => p.id === p1.id)!;
    expect(reloaded.teamValue).toBe(25_000); // 10,000 first Primary + 15,000 kept
  });

  it("lets an experienced player go to a pro team for nothing", () => {
    const team = buildLegalTeam("SS Team 2", "sevens-skill-selection");
    const p1 = team.players[0];
    createPendingSkillSelection(team, "m1", [p1.id]);
    const [entry] = team.pendingDevelopment!;
    if (entry.kind !== "sevens-skill-selection") throw new Error(entry.kind);
    startPrimarySelection(team, entry, p1.id, SkillCategory.GENERAL);
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    const treasury = team.treasury;
    const result = rollPrimarySelection(team, entry, { rollDie: () => 1 });
    const [offer] = result.draft.offers;
    releaseDraftedPlayer(team, offer);
    expect(team.treasury).toBe(treasury);
    expect(team.players.find((p) => p.id === p1.id)).toBeUndefined();
    expect(team.draftHistory).toHaveLength(1);
  });
});

describe("Save/resume and cloud persistence round-trip", () => {
  it("preserves advancement mode, pending development, allocations and Draft history through a JSON round trip", () => {
    const team = buildLegalTeam("Cloud Team", "sevens-skill-selection");
    lockAdvancementMode(team);
    createPendingSkillSelection(team, "match-9", [team.players[0].id]);
    allocateMatchedPlaySkill(team, { tier: 1 }, team.players[1], SkillType.BLOCK, "primary");
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
        (a: { name: string }) => a.name === SkillType.BLOCK
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
