import { fixtureValue } from "../../src/testing/fixtureValue";
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
  type Team,
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
import {
  applyAdvancement,
  mustAdvance,
} from "../../src/game/progression/progression";
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
  const lineman = fixtureValue(
    roster.playerTemplates.find((t) => t.positionName.includes("Lineman"))
  );
  for (let i = 0; i < 7; i++) {
    const player = createPlayer(lineman, team.id, i + 1);
    team.players.push(player);
    team.treasury -= lineman.cost;
  }
  chooseVeteran(team, fixtureValue(team.players[0]).id);
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

    expect(() => {
      setAdvancementMode(team, "matched-play");
    }).toThrow(/immutable/);

    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [team, opponent], true);
    const scorer = team.players[0];
    for (let i = 0; i < 5; i++) {
      bus.emit(GameEventNames.Touchdown, {
        teamId: team.id,
        score: 1,
        scorerId: fixtureValue(scorer).id,
      });
    }
    tracker.applySpp([team, opponent]);
    expect(fixtureValue(scorer).spp).toBe(15);
    expect(mustAdvance(fixtureValue(scorer))).toBe(true);

    team.pendingDevelopment = [
      {
        id: "pending-1",
        kind: "advanced-league-advancement",
        playerId: fixtureValue(scorer).id,
        createdAt: Date.now(),
      },
    ];
    saveTeam(team);

    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
      draftBudget: 5_000_000,
    });
    let compatibility = checkTeamCompatibility(
      fixtureValue(getTeamById(team.id)),
      profile
    );
    expect(compatibility.compatible).toBe(false);
    expect(compatibility.reasons.join(" ")).toMatch(/unresolved development/);

    const legal = fixtureValue(
      [SkillType.BLOCK, SkillType.DODGE, SkillType.TACKLE].find(
        (candidate) =>
          fixtureValue(scorer).skills.every((s) => s.type !== candidate)
      )
    );
    applyAdvancement(fixtureValue(scorer), {
      kind: "chosen-primary",
      skill: legal,
    });
    team.pendingDevelopment = [];
    saveTeam(team);

    compatibility = checkTeamCompatibility(
      fixtureValue(getTeamById(team.id)),
      profile
    );
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
    allocateMatchedPlaySkill(
      team,
      roster,
      fixtureValue(team.players[0]),
      SkillType.BLOCK,
      "primary"
    );
    expect(matchedPlaySkillStatus(team, roster)).toMatchObject({
      points: 1,
      remaining: 0,
    });
    expect(calculateTeamValue(team)).toBe(valueBefore);

    lockAdvancementMode(team);
    saveTeam(team);
    expect(
      checkTeamCompatibility(fixtureValue(getTeamById(team.id)), profile)
        .compatible
    ).toBe(true);

    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [team, opponent], true);
    bus.emit(GameEventNames.Touchdown, {
      teamId: team.id,
      score: 1,
      scorerId: fixtureValue(team.players[0]).id,
    });
    tracker.applySpp([team, opponent]);
    expect(fixtureValue(team.players[0]).spp).toBe(0);
  });
});

describe("Sevens Skill Selection journey", () => {
  it("keeps one award when the same match's development is recorded again", () => {
    const team = buildLegalTeam("Retry Team", "sevens-skill-selection");
    const eligible = eligibleSkillSelectionPlayers(team);
    createPendingSkillSelection(team, "fixture-1", eligible);
    createPendingSkillSelection(team, "fixture-1", eligible);
    expect(team.pendingDevelopment).toEqual([
      expect.objectContaining({
        id: "pending-fixture-1-skill-selection",
        matchId: "fixture-1",
      }),
    ]);
  });

  it("plays a match with no SPP, resolves the pending award, and runs the Draft", () => {
    const team = buildLegalTeam("SS Team", "sevens-skill-selection");
    lockAdvancementMode(team);
    saveTeam(team);

    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [team, opponent], true);
    const [p1] = team.players;
    bus.emit(GameEventNames.PlayerActivated, fixtureValue(p1).id);
    bus.emit(GameEventNames.Touchdown, {
      teamId: team.id,
      score: 1,
      scorerId: fixtureValue(p1).id,
    });
    tracker.applySpp([team, opponent]);
    expect(fixtureValue(p1).spp).toBe(0);

    const eligible = eligibleSkillSelectionPlayers(team);
    expect(eligible).toHaveLength(7);
    createPendingSkillSelection(team, "match-1", eligible);
    saveTeam(team);
    expect(fixtureValue(getTeamById(team.id)).pendingDevelopment).toHaveLength(
      1
    );

    const entry = fixtureValue(fixtureValue(team.pendingDevelopment)[0]);
    if (entry.kind !== "sevens-skill-selection") throw new Error(entry.kind);
    expect(skillSelectionDecision(team, entry).type).toBe("choose-route");
    startPrimarySelection(
      team,
      entry,
      fixtureValue(p1).id,
      SkillCategory.GENERAL
    );
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    const result = rollPrimarySelection(team, entry, { rollDie: () => 3 });
    expect(result.skill).toBe(SkillType.TACKLE);

    expect(result.draft).toEqual({ offers: [], released: [] });
    expect(team.pendingDevelopment).toEqual([]);
    saveTeam(team);

    const profile = createRosterRuleProfile({
      advancementMode: "sevens-skill-selection",
      draftBudget: 5_000_000,
    });
    expect(
      checkTeamCompatibility(fixtureValue(getTeamById(team.id)), profile)
        .compatible
    ).toBe(true);
  });

  it("keeps the 15,000 value rise of a player the coach paid to keep after a reload", () => {
    const team = buildLegalTeam("SS Team 3", "sevens-skill-selection");
    const p1 = team.players[0];
    createPendingSkillSelection(team, "m1", [fixtureValue(p1).id]);
    const entry = fixtureValue(fixtureValue(team.pendingDevelopment)[0]);
    if (entry.kind !== "sevens-skill-selection") throw new Error(entry.kind);
    startPrimarySelection(
      team,
      entry,
      fixtureValue(p1).id,
      SkillCategory.GENERAL
    );
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    const result = rollPrimarySelection(team, entry, { rollDie: () => 1 });
    keepDraftedPlayer(team, fixtureValue(result.draft.offers[0]));
    saveTeam(team);

    const reloaded = fixtureValue(
      fixtureValue(getTeamById(team.id)).players.find(
        (p) => p.id === fixtureValue(p1).id
      )
    );
    expect(reloaded.teamValue).toBe(25_000);
  });

  it("lets an experienced player go to a pro team for nothing", () => {
    const team = buildLegalTeam("SS Team 2", "sevens-skill-selection");
    const p1 = team.players[0];
    createPendingSkillSelection(team, "m1", [fixtureValue(p1).id]);
    const entry = fixtureValue(fixtureValue(team.pendingDevelopment)[0]);
    if (entry.kind !== "sevens-skill-selection") throw new Error(entry.kind);
    startPrimarySelection(
      team,
      entry,
      fixtureValue(p1).id,
      SkillCategory.GENERAL
    );
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    const treasury = team.treasury;
    const result = rollPrimarySelection(team, entry, { rollDie: () => 1 });
    const [offer] = result.draft.offers;
    releaseDraftedPlayer(team, fixtureValue(offer));
    expect(team.treasury).toBe(treasury);
    expect(
      team.players.find((p) => p.id === fixtureValue(p1).id)
    ).toBeUndefined();
    expect(team.draftHistory).toHaveLength(1);
  });
});

describe("Save/resume and cloud persistence round-trip", () => {
  it("preserves advancement mode, pending development, allocations and Draft history through a JSON round trip", () => {
    const team = buildLegalTeam("Cloud Team", "sevens-skill-selection");
    lockAdvancementMode(team);
    createPendingSkillSelection(team, "match-9", [
      fixtureValue(team.players[0]).id,
    ]);
    allocateMatchedPlaySkill(
      team,
      { tier: 1 },
      fixtureValue(team.players[1]),
      SkillType.BLOCK,
      "primary"
    );
    saveTeam(team);

    const roundTripped = JSON.parse(JSON.stringify(getTeamById(team.id)));

    expect(roundTripped.advancementMode).toBe("sevens-skill-selection");
    expect(roundTripped.advancementModeLocked).toBe(true);
    expect(roundTripped.pendingDevelopment).toHaveLength(1);
    expect(roundTripped.pendingDevelopment[0].eligibleParticipantIds).toEqual([
      fixtureValue(team.players[0]).id,
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

    expect(legacy.advancementMode).toBeUndefined();
    const roster = getRosterByRosterName(RosterName.HUMAN);
    const lineman = fixtureValue(
      roster.playerTemplates.find((t) => t.positionName.includes("Lineman"))
    );
    legacy.players.push(createPlayer(lineman, legacy.id, 1));

    const bus = new EventBus();
    const opponent = buildLegalTeam("Opponent", "advanced-league");
    const tracker = new MatchStats(bus, [legacy, opponent], true);
    bus.emit(GameEventNames.Touchdown, {
      teamId: legacy.id,
      score: 1,
      scorerId: fixtureValue(legacy.players[0]).id,
    });
    tracker.applySpp([legacy, opponent]);
    expect(fixtureValue(legacy.players[0]).spp).toBe(3);

    const profile = createRosterRuleProfile({
      advancementMode: "advanced-league",
    });
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
    const lineman = fixtureValue(
      roster.playerTemplates.find((t) => t.positionName.includes("Lineman"))
    );
    const player = createPlayer(lineman, legacy.id, 1);
    player.spp = 5;
    legacy.players.push(player);
    saveTeam(legacy);

    const reloaded = fixtureValue(loadTeams().find((t) => t.id === legacy.id));
    expect(reloaded.advancementMode).toBe("advanced-league");
    expect(reloaded.advancementModeLocked).toBe(true);
  });
});
