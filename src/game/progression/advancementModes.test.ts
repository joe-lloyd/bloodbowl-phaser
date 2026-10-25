import { describe, expect, it } from "vitest";
import { Player, PlayerStatus, PlayerStats } from "../../types/Player";
import { getSkill, SkillCategory, SkillType } from "../../types/Skills";
import {
  createTeam,
  lockAdvancementMode,
  PendingDevelopment,
  RosterName,
  setAdvancementMode,
  Team,
} from "../../types/Team";
import {
  allocateMatchedPlaySkill,
  chooseSecondarySkill,
  createPendingSkillSelection,
  eligibleSkillSelectionPlayers,
  keepDraftedPlayer,
  matchedPlaySkillStatus,
  nominatePrimarySkill,
  releaseDraftedPlayer,
  rollDraftOffers,
  rollPrimarySelection,
  rollSecondaryCandidates,
  skillSelectionDecision,
  startPrimarySelection,
  startSecondarySelection,
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

/** Test data: a player who already learned `skill` in an earlier game. */
function withAddedSkill(target: Player, skill: SkillType, value: number): Player {
  target.skills.push(getSkill(skill));
  target.advancements!.push({
    id: `adv-${target.advancements!.length + 1}`,
    type: "primary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease: value,
  });
  target.teamValue += value;
  return target;
}

function teamOf(
  players: Player[],
  treasury = 0,
  mode: Team["advancementMode"] = "sevens-skill-selection"
): Team {
  const team = createTeam(
    "T1",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    50_000,
    treasury,
    mode
  );
  team.players = players;
  return team;
}

function fakeRng(rolls: number[]) {
  let index = 0;
  return {
    rollDie: () => {
      if (index >= rolls.length) throw new Error("fakeRng ran out of rolls");
      return rolls[index++];
    },
  };
}

type SkillSelectionEntry = Extract<
  PendingDevelopment,
  { kind: "sevens-skill-selection" }
>;
type DraftOfferEntry = Extract<
  PendingDevelopment,
  { kind: "drafted-player-offer" }
>;

function onlySelection(team: Team): SkillSelectionEntry {
  const entries = (team.pendingDevelopment ?? []).filter(
    (entry): entry is SkillSelectionEntry =>
      entry.kind === "sevens-skill-selection"
  );
  expect(entries).toHaveLength(1);
  return entries[0];
}

function draftOffers(team: Team): DraftOfferEntry[] {
  return (team.pendingDevelopment ?? []).filter(
    (entry): entry is DraftOfferEntry => entry.kind === "drafted-player-offer"
  );
}

describe("advancement mode immutability", () => {
  it("locks the mode once finalized and refuses conversion", () => {
    const team = teamOf([]);
    lockAdvancementMode(team);
    expect(() => setAdvancementMode(team, "advanced-league")).toThrow(
      /immutable/
    );
    // Re-affirming the same mode is fine.
    expect(() => setAdvancementMode(team, "sevens-skill-selection")).not.toThrow();
  });

  it("allows free changes before the team is locked", () => {
    const team = teamOf([], 0, undefined);
    setAdvancementMode(team, "matched-play");
    setAdvancementMode(team, "advanced-league");
    expect(team.advancementMode).toBe("advanced-league");
  });
});

describe("Matched Play skill points (MP5, MP6)", () => {
  it("gives a team Skill Points equal to its tier", () => {
    expect(matchedPlaySkillStatus(teamOf([]), { tier: 3 })).toEqual({
      points: 3,
      spent: 0,
      remaining: 3,
      secondaryCount: 0,
      eliteCount: 0,
    });
  });

  it("charges 1 point for a Primary skill and 2 for a Secondary, with no value increase", () => {
    const p1 = player("p1");
    const p2 = player("p2");
    const team = teamOf([p1, p2], 0, "matched-play");
    allocateMatchedPlaySkill(team, { tier: 3 }, p1, SkillType.TACKLE, "primary");
    allocateMatchedPlaySkill(team, { tier: 3 }, p2, SkillType.GRAB, "secondary");
    expect(matchedPlaySkillStatus(team, { tier: 3 })).toEqual({
      points: 3,
      spent: 3,
      remaining: 0,
      secondaryCount: 1,
      eliteCount: 0,
    });
    expect(p1.teamValue).toBe(0);
    expect(p2.teamValue).toBe(0);
    expect(p2.skills.map((skill) => skill.type)).toEqual([SkillType.GRAB]);
  });

  it("refuses a skill the team has no points left for", () => {
    const p1 = player("p1");
    const p2 = player("p2");
    const team = teamOf([p1, p2], 0, "matched-play");
    allocateMatchedPlaySkill(team, { tier: 1 }, p1, SkillType.TACKLE, "primary");
    expect(() =>
      allocateMatchedPlaySkill(team, { tier: 1 }, p2, SkillType.KICK, "primary")
    ).toThrow("Not enough Skill Points: Kick costs 1 and 0 remain.");
  });

  it("allows only one Secondary skill per team", () => {
    const p1 = player("p1");
    const p2 = player("p2");
    const team = teamOf([p1, p2], 0, "matched-play");
    allocateMatchedPlaySkill(team, { tier: 4 }, p1, SkillType.GRAB, "secondary");
    expect(() =>
      allocateMatchedPlaySkill(team, { tier: 4 }, p2, SkillType.BRAWLER, "secondary")
    ).toThrow("A team may take only one Secondary skill.");
  });

  it("allows only one added skill per player", () => {
    const p1 = player("p1");
    const team = teamOf([p1], 0, "matched-play");
    allocateMatchedPlaySkill(team, { tier: 4 }, p1, SkillType.TACKLE, "primary");
    expect(() =>
      allocateMatchedPlaySkill(team, { tier: 4 }, p1, SkillType.KICK, "primary")
    ).toThrow("This player already has a Matched Play skill.");
  });

  it("allows at most two Elite skills per team", () => {
    const [p1, p2, p3] = [player("p1"), player("p2"), player("p3")];
    const team = teamOf([p1, p2, p3], 0, "matched-play");
    allocateMatchedPlaySkill(team, { tier: 4 }, p1, SkillType.BLOCK, "primary");
    allocateMatchedPlaySkill(team, { tier: 4 }, p2, SkillType.DODGE, "primary");
    expect(() =>
      allocateMatchedPlaySkill(team, { tier: 4 }, p3, SkillType.GUARD, "secondary")
    ).toThrow("A team may take at most two Elite skills.");
  });
});

describe("Sevens Skill Selection eligibility", () => {
  it("offers every player who did not end the game as a Casualty", () => {
    const players = ["ok", "ko", "reserve", "hurt", "dead"].map((id) =>
      player(id)
    );
    players[1].status = PlayerStatus.KO;
    players[2].status = PlayerStatus.RESERVE;
    players[3].status = PlayerStatus.INJURED;
    players[4].status = PlayerStatus.DEAD;
    expect(eligibleSkillSelectionPlayers(teamOf(players))).toEqual([
      "ok",
      "ko",
      "reserve",
    ]);
  });
});

describe("Sevens Skill Selection, Primary route (A2, A4, A5)", () => {
  it("has the coach, the opponent and the coach name a skill, then a D3 picks one", () => {
    const p1 = player("p1");
    const team = teamOf([p1]);
    createPendingSkillSelection(team, "match-1", ["p1"]);
    const entry = onlySelection(team);

    expect(skillSelectionDecision(team, entry)).toEqual({
      type: "choose-route",
      primaryOptions: [
        {
          playerId: "p1",
          categories: [SkillCategory.GENERAL, SkillCategory.AGILITY],
        },
      ],
      secondaryAvailable: true,
    });

    startPrimarySelection(team, entry, "p1", SkillCategory.GENERAL);
    expect(skillSelectionDecision(team, entry)).toMatchObject({
      type: "name-primary-skill",
      chooser: "coach",
      playerId: "p1",
      category: SkillCategory.GENERAL,
      named: [],
    });

    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    const opponentTurn = skillSelectionDecision(team, entry);
    expect(opponentTurn).toEqual({
      type: "name-primary-skill",
      chooser: "opponent",
      playerId: "p1",
      category: SkillCategory.GENERAL,
      named: [SkillType.BLOCK],
      options: [
        SkillType.DAUNTLESS,
        SkillType.FEND,
        SkillType.FRENZY,
        SkillType.KICK,
        SkillType.STEADY_FOOTING,
        SkillType.STRIP_BALL,
        SkillType.SURE_HANDS,
        SkillType.TACKLE,
        SkillType.TAUNT,
        SkillType.WRESTLE,
      ],
    });

    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    expect(skillSelectionDecision(team, entry)).toEqual({
      type: "roll-primary-d3",
      playerId: "p1",
      named: [SkillType.BLOCK, SkillType.KICK, SkillType.TACKLE],
    });

    // D3 = 2 picks the opponent's skill; the Draft D6 = 6 keeps p1.
    const result = rollPrimarySelection(team, entry, fakeRng([2, 6]));
    expect(result.skill).toBe(SkillType.KICK);
    expect(result.d3).toBe(2);
    expect(p1.skills.map((skill) => skill.type)).toEqual([SkillType.KICK]);
    expect(p1.teamValue).toBe(10_000);
    expect(team.pendingDevelopment).toEqual([]);
  });

  it("charges 20,000 for a Primary skill after the player's first", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.DODGE, 10_000);
    const team = teamOf([p1]);
    createPendingSkillSelection(team, "match-2", ["p1"]);
    const entry = onlySelection(team);
    startPrimarySelection(team, entry, "p1", SkillCategory.GENERAL);
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    nominatePrimarySkill(team, entry, "opponent", SkillType.KICK);
    nominatePrimarySkill(team, entry, "coach", SkillType.TACKLE);
    rollPrimarySelection(team, entry, fakeRng([1, 6]));
    expect(p1.teamValue).toBe(30_000);
  });

  it("refuses a skill named out of turn, twice, or that can never be gained", () => {
    const team = teamOf([player("p1")]);
    createPendingSkillSelection(team, "match-1", ["p1"]);
    const entry = onlySelection(team);
    startPrimarySelection(team, entry, "p1", SkillCategory.GENERAL);
    expect(() =>
      nominatePrimarySkill(team, entry, "opponent", SkillType.BLOCK)
    ).toThrow("It is the coach's turn to name a skill.");
    expect(() =>
      nominatePrimarySkill(team, entry, "coach", SkillType.PRO)
    ).toThrow("Pro cannot be named for p1.");
    nominatePrimarySkill(team, entry, "coach", SkillType.BLOCK);
    expect(() =>
      nominatePrimarySkill(team, entry, "opponent", SkillType.BLOCK)
    ).toThrow("Block cannot be named for p1.");
  });

  it("refuses a Primary route for a player who ended the game as a Casualty", () => {
    const hurt = player("hurt");
    hurt.status = PlayerStatus.INJURED;
    const team = teamOf([player("p1"), hurt]);
    createPendingSkillSelection(team, "match-1", ["p1"]);
    expect(() =>
      startPrimarySelection(team, onlySelection(team), "hurt", SkillCategory.GENERAL)
    ).toThrow("hurt cannot gain a skill this game.");
  });
});

describe("Sevens Skill Selection, Secondary route (A3, A4, A5)", () => {
  it("picks a random player, then rolls two skills in a category the coach picks", () => {
    const p1 = player("p1");
    const p2 = player("p2");
    const team = teamOf([p1, p2]);
    createPendingSkillSelection(team, "match-1", ["p1", "p2"]);
    const entry = onlySelection(team);

    startSecondarySelection(team, entry, fakeRng([2]));
    expect(skillSelectionDecision(team, entry)).toEqual({
      type: "choose-secondary-category",
      playerId: "p2",
      categories: [SkillCategory.STRENGTH],
    });

    rollSecondaryCandidates(team, entry, SkillCategory.STRENGTH, fakeRng([1, 6, 4, 2]));
    expect(skillSelectionDecision(team, entry)).toEqual({
      type: "choose-secondary-skill",
      playerId: "p2",
      candidates: [
        { skill: SkillType.GUARD, firstD6: 1, secondD6: 6 },
        { skill: SkillType.MIGHTY_BLOW, firstD6: 4, secondD6: 2 },
      ],
    });

    chooseSecondarySkill(team, entry, SkillType.GUARD, fakeRng([6]));
    expect(p2.skills.map((skill) => skill.type)).toEqual([SkillType.GUARD]);
    expect(p2.teamValue).toBe(20_000);
    expect(p1.skills).toEqual([]);
    expect(team.pendingDevelopment).toEqual([]);
  });

  it("charges 30,000 for a Secondary skill after the player's first", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.DODGE, 10_000);
    const team = teamOf([p1]);
    createPendingSkillSelection(team, "match-1", ["p1"]);
    const entry = onlySelection(team);
    startSecondarySelection(team, entry, fakeRng([1]));
    rollSecondaryCandidates(team, entry, SkillCategory.STRENGTH, fakeRng([1, 6, 4, 2]));
    chooseSecondarySkill(team, entry, SkillType.MIGHTY_BLOW, fakeRng([6]));
    expect(p1.teamValue).toBe(40_000);
  });

  it("re-rolls Pro and Leader, which can never be gained", () => {
    const p1 = player("p1");
    p1.secondary = [SkillCategory.GENERAL, SkillCategory.PASSING];
    const team = teamOf([p1]);
    createPendingSkillSelection(team, "match-1", ["p1"]);
    const entry = onlySelection(team);
    startSecondarySelection(team, entry, fakeRng([1]));
    // General 1,6 is Pro: re-rolled to 1,1 Block. Then 4,2 Sure Hands.
    rollSecondaryCandidates(team, entry, SkillCategory.GENERAL, fakeRng([1, 6, 1, 1, 4, 3]));
    expect(skillSelectionDecision(team, entry)).toMatchObject({
      candidates: [
        { skill: SkillType.BLOCK, firstD6: 1, secondD6: 1 },
        { skill: SkillType.SURE_HANDS, firstD6: 4, secondD6: 3 },
      ],
    });
  });
});

describe("Drafted Players (A6)", () => {
  it("makes no offer when the D6 beats the player's added skills", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.BLOCK, 10_000);
    const team = teamOf([p1], 500_000);
    expect(rollDraftOffers(team, fakeRng([2]), "m1")).toEqual({
      offers: [],
      released: [],
    });
    expect(team.pendingDevelopment ?? []).toEqual([]);
  });

  it("lets the coach keep an offered player by paying their current value", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.BLOCK, 10_000);
    const team = teamOf([p1], 100_000);
    rollDraftOffers(team, fakeRng([1]), "m1");
    const [offer] = draftOffers(team);
    expect(offer).toMatchObject({
      kind: "drafted-player-offer",
      playerId: "p1",
      roll: 1,
      addedSkillCount: 1,
    });

    keepDraftedPlayer(team, offer);
    expect(team.treasury).toBe(40_000); // paid 50,000 cost + 10,000 skill
    expect(p1.teamValue).toBe(25_000);
    expect(team.players).toEqual([p1]);
    expect(team.pendingDevelopment).toEqual([]);
  });

  it("removes a released player without paying the team anything", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.BLOCK, 10_000);
    const team = teamOf([p1], 100_000);
    rollDraftOffers(team, fakeRng([1]), "m1");
    releaseDraftedPlayer(team, draftOffers(team)[0]);
    expect(team.players).toEqual([]);
    expect(team.treasury).toBe(100_000);
    expect(team.pendingDevelopment).toEqual([]);
    expect(team.draftHistory).toHaveLength(1);
    expect(team.draftHistory![0]).toMatchObject({
      playerId: "p1",
      roll: 1,
      addedSkillCount: 1,
      matchId: "m1",
    });
    expect(team.draftHistory![0].player.skills.map((s) => s.type)).toEqual([
      SkillType.BLOCK,
    ]);
  });

  it("releases a player at once when the Treasury cannot pay their value", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.BLOCK, 10_000);
    const team = teamOf([p1], 59_000);
    const outcome = rollDraftOffers(team, fakeRng([1]), "m1");
    expect(outcome.offers).toEqual([]);
    expect(outcome.released.map((record) => record.playerId)).toEqual(["p1"]);
    expect(team.players).toEqual([]);
    expect(team.pendingDevelopment ?? []).toEqual([]);
  });

  it("refuses to keep a player once the Treasury can no longer pay", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.BLOCK, 10_000);
    const p2 = withAddedSkill(player("p2"), SkillType.DODGE, 10_000);
    const team = teamOf([p1, p2], 100_000);
    rollDraftOffers(team, fakeRng([1, 1]), "m1");
    const [first, second] = draftOffers(team);
    keepDraftedPlayer(team, first);
    expect(() => keepDraftedPlayer(team, second)).toThrow(
      "The Treasury has 40,000 but keeping p2 costs 60,000."
    );
  });

  it("never rolls for a player with no added skills or who died", () => {
    const dead = withAddedSkill(player("dead"), SkillType.BLOCK, 10_000);
    dead.status = PlayerStatus.DEAD;
    const team = teamOf([player("p1"), dead], 500_000);
    expect(rollDraftOffers(team, fakeRng([]), "m1")).toEqual({
      offers: [],
      released: [],
    });
  });

  it("rolls the Draft as soon as the game's skill is learned", () => {
    const p1 = withAddedSkill(player("p1"), SkillType.DODGE, 10_000);
    const team = teamOf([p1], 0);
    createPendingSkillSelection(team, "match-1", ["p1"]);
    const entry = onlySelection(team);
    startSecondarySelection(team, entry, fakeRng([1]));
    rollSecondaryCandidates(team, entry, SkillCategory.STRENGTH, fakeRng([1, 6, 4, 2]));
    // Two added skills now; D6 = 2 is an offer the empty Treasury cannot pay.
    const result = chooseSecondarySkill(team, entry, SkillType.GUARD, fakeRng([2]));
    expect(result.draft.released.map((record) => record.playerId)).toEqual(["p1"]);
    expect(team.players).toEqual([]);
  });
});
