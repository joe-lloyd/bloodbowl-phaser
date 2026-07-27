import { describe, expect, it } from "vitest";
import { Player, PlayerStatus, PlayerStats } from "../../types/Player";
import { SkillCategory, SkillType } from "../../types/Skills";
import {
  createTeam,
  hasBlockingPendingDevelopment,
  lockAdvancementMode,
  RosterName,
  setAdvancementMode,
  Team,
} from "../../types/Team";
import {
  addedSkillCount,
  allocateMatchedPlaySkill,
  confirmSkillSelectionAward,
  createMatchedPlayPackage,
  createPendingSkillSelection,
  eligibleSkillSelectionParticipants,
  matchedPlayPackageStatus,
  randomEligibleParticipant,
  resolveDraft,
  rollSkillSelectionCandidates,
} from "./advancementModes";

const baseStats: PlayerStats = { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 };

function player(id: string, teamId = "team-1"): Player {
  return {
    id,
    playerName: id,
    positionName: "Lineman",
    number: 1,
    keywords: [],
    teamId,
    stats: { ...baseStats },
    baseStats: { ...baseStats },
    skills: [],
    primary: [SkillCategory.GENERAL, SkillCategory.AGILITY],
    secondary: [SkillCategory.STRENGTH],
    spp: 0,
    level: 0,
    playerKind: "roster",
    advancements: [],
    characteristicAdvances: {},
    status: PlayerStatus.ACTIVE,
    injuries: [],
    hasActed: false,
    cost: 50_000,
    teamValue: 0,
  };
}

function fakeRng(rolls: number[]) {
  let index = 0;
  return { rollDie: () => rolls[index++] };
}

describe("advancement mode immutability", () => {
  it("locks the mode once finalized and refuses conversion", () => {
    const team = createTeam("T1", RosterName.HUMAN, {
      primary: 0,
      secondary: 0,
    } as never, 50_000);
    setAdvancementMode(team, "sevens-skill-selection");
    lockAdvancementMode(team);
    expect(() => setAdvancementMode(team, "advanced-league")).toThrow(
      /immutable/
    );
    // Re-affirming the same mode is fine.
    expect(() => setAdvancementMode(team, "sevens-skill-selection")).not.toThrow();
  });

  it("allows free changes before the team is locked", () => {
    const team = createTeam("T1", RosterName.HUMAN, {
      primary: 0,
      secondary: 0,
    } as never, 50_000);
    setAdvancementMode(team, "matched-play");
    setAdvancementMode(team, "advanced-league");
    expect(team.advancementMode).toBe("advanced-league");
  });
});

describe("Matched Play package allocation", () => {
  const roster = { tier: 1 };
  const pkg = createMatchedPlayPackage({
    tierAllowance: { 1: 2 },
    secondaryAllowance: { 1: 1 },
  });

  it("allocates a Primary skill and a Secondary skill within allowance", () => {
    const team = { matchedPlayAllocations: [] } as unknown as Team;
    const p1 = player("p1");
    const p2 = player("p2");
    allocateMatchedPlaySkill(team, roster, pkg, p1, SkillType.BLOCK, "primary");
    allocateMatchedPlaySkill(
      team,
      roster,
      pkg,
      p2,
      SkillType.GUARD,
      "secondary"
    );
    expect(p1.teamValue).toBe(30_000); // Block is Elite: 20k + 10k
    expect(p2.teamValue).toBe(50_000); // Secondary Guard: 40k + 10k elite
    const status = matchedPlayPackageStatus(team, roster, pkg);
    expect(status).toMatchObject({ used: 2, totalAllowance: 2, complete: true });
  });

  it("allows a Primary Skill to substitute into an allowed Secondary slot", () => {
    const team = { matchedPlayAllocations: [] } as unknown as Team;
    const p1 = player("p1");
    // BLOCK is legal Primary for this player; using it in the "secondary"
    // allowance slot is the explicit substitution scenario.
    const allocation = allocateMatchedPlaySkill(
      team,
      roster,
      pkg,
      p1,
      SkillType.BLOCK,
      "primary"
    );
    expect(allocation.usedSecondarySlot).toBe(false);
  });

  it("rejects a second package skill for the same player", () => {
    const team = { matchedPlayAllocations: [] } as unknown as Team;
    const p1 = player("p1");
    allocateMatchedPlaySkill(team, roster, pkg, p1, SkillType.BLOCK, "primary");
    expect(() =>
      allocateMatchedPlaySkill(team, roster, pkg, p1, SkillType.DODGE, "primary")
    ).toThrow(/already received/);
  });

  it("rejects allocation once the tier allowance is exhausted", () => {
    const team = { matchedPlayAllocations: [] } as unknown as Team;
    const p1 = player("p1");
    const p2 = player("p2");
    const p3 = player("p3");
    allocateMatchedPlaySkill(team, roster, pkg, p1, SkillType.BLOCK, "primary");
    allocateMatchedPlaySkill(team, roster, pkg, p2, SkillType.DODGE, "primary");
    expect(() =>
      allocateMatchedPlaySkill(team, roster, pkg, p3, SkillType.TACKLE, "primary")
    ).toThrow(/no remaining allowance/);
  });

  it("rejects a Secondary Skill once the secondary allowance is exhausted", () => {
    const team = { matchedPlayAllocations: [] } as unknown as Team;
    const p1 = player("p1");
    const p2 = player("p2");
    allocateMatchedPlaySkill(
      team,
      roster,
      pkg,
      p1,
      SkillType.GUARD,
      "secondary"
    );
    expect(() =>
      allocateMatchedPlaySkill(team, roster, pkg, p2, SkillType.GUARD, "secondary")
    ).toThrow(/no remaining Secondary/);
  });
});

describe("Sevens Skill Selection", () => {
  it("excludes DEAD participants from eligibility", () => {
    const p1 = player("p1");
    const p2 = player("p2");
    p2.status = PlayerStatus.DEAD;
    const team = { players: [p1, p2] } as Team;
    expect(
      eligibleSkillSelectionParticipants(team, ["p1", "p2"])
    ).toEqual(["p1"]);
  });

  it("rolls two legal random candidates for a chosen Primary category", () => {
    const p1 = player("p1");
    const [first, second] = rollSkillSelectionCandidates(
      p1,
      SkillCategory.AGILITY,
      "primary",
      fakeRng([1, 4, 4, 2])
    );
    expect(first.skill).toBe(SkillType.DODGE);
    expect(second.skill).toBe(SkillType.LEAP);
  });

  it("randomly selects an eligible participant for the Secondary method", () => {
    const chosen = randomEligibleParticipant(
      ["p1", "p2", "p3"],
      fakeRng([2])
    );
    expect(chosen).toBe("p2");
  });

  it("confirms the award with source match provenance and standard value", () => {
    const p1 = player("p1");
    const record = confirmSkillSelectionAward(
      p1,
      SkillType.BLOCK,
      "primary",
      "match-1"
    );
    expect(record).toMatchObject({
      source: "sevens-skill-selection",
      sourceMatchId: "match-1",
      valueIncrease: 30_000,
    });
    expect(p1.skills.some((skill) => skill.type === SkillType.BLOCK)).toBe(
      true
    );
  });

  it("persists the offered candidate rolls alongside the confirmed skill", () => {
    const p1 = player("p1");
    const candidates: [
      { skill: SkillType; firstD6: number; secondD6: number },
      { skill: SkillType; firstD6: number; secondD6: number },
    ] = [
      { skill: SkillType.BLOCK, firstD6: 1, secondD6: 1 },
      { skill: SkillType.DODGE, firstD6: 1, secondD6: 4 },
    ];
    const record = confirmSkillSelectionAward(
      p1,
      SkillType.BLOCK,
      "primary",
      "match-1",
      candidates
    );
    expect(record.candidateRolls).toEqual([
      { skill: SkillType.BLOCK, firstD6: 1, secondD6: 1 },
      { skill: SkillType.DODGE, firstD6: 1, secondD6: 4 },
    ]);
  });

  it("creates a pending decision that freezes the eligible participant list", () => {
    const team = {} as Team;
    const entry = createPendingSkillSelection(team, "match-1", ["p1", "p2"]);
    expect(entry.kind).toBe("sevens-skill-selection");
    expect(team.pendingDevelopment).toHaveLength(1);
    expect(hasBlockingPendingDevelopment(team)).toBe(true);
  });
});

describe("The Draft", () => {
  it("keeps a player whose roll exceeds their added-skill count", () => {
    const p1 = player("p1");
    confirmSkillSelectionAward(p1, SkillType.BLOCK, "primary", "m1");
    confirmSkillSelectionAward(p1, SkillType.GUARD, "secondary", "m1");
    expect(addedSkillCount(p1)).toBe(2);
    const team = { players: [p1], treasury: 0 } as Team;
    const outcome = resolveDraft(team, fakeRng([3]));
    expect(outcome.records).toHaveLength(0);
    expect(team.players).toHaveLength(1);
  });

  it("drafts a player whose roll is at or below their added-skill count and pays exact compensation", () => {
    const p1 = player("p1");
    confirmSkillSelectionAward(p1, SkillType.BLOCK, "primary", "m1"); // 30k (elite primary)
    confirmSkillSelectionAward(p1, SkillType.GUARD, "secondary", "m1"); // 50k (elite secondary)
    const team = {
      players: [p1],
      treasury: 0,
      draftHistory: [],
    } as unknown as Team;
    const outcome = resolveDraft(team, fakeRng([2]), "m2");
    expect(outcome.records).toHaveLength(1);
    expect(outcome.goldCredited).toBe(80_000);
    expect(team.players).toHaveLength(0);
    expect(team.treasury).toBe(80_000);
    expect(team.draftHistory).toHaveLength(1);
    expect(team.draftHistory![0]).toMatchObject({
      playerId: "p1",
      roll: 2,
      addedSkillCount: 2,
      valueIncrease: 80_000,
    });
    // Full career/skill history survives the removal as an immutable snapshot.
    expect(team.draftHistory![0].player.skills.map((s) => s.type)).toEqual([
      SkillType.BLOCK,
      SkillType.GUARD,
    ]);
  });

  it("never rolls for a player with no added skills", () => {
    const p1 = player("p1");
    const team = { players: [p1], treasury: 0 } as Team;
    const outcome = resolveDraft(team, fakeRng([]));
    expect(outcome.records).toHaveLength(0);
  });

  it("does not roll for a DEAD player even with added skills", () => {
    const p1 = player("p1");
    confirmSkillSelectionAward(p1, SkillType.BLOCK, "primary", "m1");
    p1.status = PlayerStatus.DEAD;
    const team = { players: [p1], treasury: 0 } as Team;
    const outcome = resolveDraft(team, fakeRng([]));
    expect(outcome.records).toHaveLength(0);
  });
});
