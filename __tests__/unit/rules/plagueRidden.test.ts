import { describe, it, expect } from "vitest";
import {
  isPlagueRiddenEligibleTarget,
  plagueRiddenApplies,
  addReserveLineman,
} from "../../../src/game/rules/plagueRidden";
import {
  Player,
  PlayerStatus,
  PositionKeyWord,
  TraitKeyWord,
  RaceKeyWord,
} from "../../../src/types/Player";
import { SkillType, getSkill } from "../../../src/types/Skills";
import { RosterName } from "../../../src/types/Team";
import { TeamFactory } from "../../../src/game/TeamFactory";

const P = (over: Partial<Player>): Player =>
  ({
    id: "p",
    teamId: "team1",
    playerName: "P",
    positionName: "Lineman",
    number: 1,
    keywords: [PositionKeyWord.LINEMAN, RaceKeyWord.HUMAN],
    status: PlayerStatus.ACTIVE,
    hasActed: false,
    skills: [],
    stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
    injuries: [],
    ...over,
  }) as Player;

/** A Nurgle killer holding Plague Ridden (unused). */
const killer = (over: Partial<Player> = {}): Player =>
  P({
    id: "killer",
    teamId: "team1",
    skills: [getSkill(SkillType.PLAGUE_RIDDEN)],
    ...over,
  });

/** A plain opposition victim with no immunity. */
const victim = (over: Partial<Player> = {}): Player =>
  P({ id: "victim", teamId: "team2", ...over });

describe("Plague Ridden — eligible targets", () => {
  it("a plain Lineman is a legal target", () => {
    expect(isPlagueRiddenEligibleTarget(victim())).toBe(true);
  });

  it("a Big Guy is immune", () => {
    expect(
      isPlagueRiddenEligibleTarget(
        victim({ keywords: [TraitKeyWord.BIG_GUY, RaceKeyWord.HUMAN] })
      )
    ).toBe(false);
  });

  it("a Decay player is immune", () => {
    expect(
      isPlagueRiddenEligibleTarget(
        victim({ skills: [getSkill(SkillType.DECAY)] })
      )
    ).toBe(false);
  });

  it("a Regeneration player is immune", () => {
    expect(
      isPlagueRiddenEligibleTarget(
        victim({ skills: [getSkill(SkillType.REGENERATION)] })
      )
    ).toBe(false);
  });

  it("a Stunty player is immune", () => {
    expect(
      isPlagueRiddenEligibleTarget(
        victim({ skills: [getSkill(SkillType.STUNTY)] })
      )
    ).toBe(false);
  });
});

describe("Plague Ridden — trigger conditions", () => {
  it("fires on a Block kill against an eligible opponent", () => {
    expect(plagueRiddenApplies(killer(), victim(), "block")).toBe(true);
  });

  it("does not fire when the casualty came from a non-Block cause", () => {
    expect(plagueRiddenApplies(killer(), victim(), "special")).toBe(false);
    expect(plagueRiddenApplies(killer(), victim(), undefined)).toBe(false);
  });

  it("does not fire a second time once spent (once per game)", () => {
    expect(
      plagueRiddenApplies(killer({ plagueRiddenUsed: true }), victim(), "block")
    ).toBe(false);
  });

  it("does not fire without the trait", () => {
    expect(
      plagueRiddenApplies(killer({ skills: [] }), victim(), "block")
    ).toBe(false);
  });

  it("does not fire against a team-mate", () => {
    expect(
      plagueRiddenApplies(killer(), victim({ teamId: "team1" }), "block")
    ).toBe(false);
  });

  it("does not fire against an immune target (Regeneration)", () => {
    expect(
      plagueRiddenApplies(
        killer(),
        victim({ skills: [getSkill(SkillType.REGENERATION)] }),
        "block"
      )
    ).toBe(false);
  });
});

describe("Plague Ridden — reinforcement", () => {
  it("adds one Lineman to the team's Reserves", () => {
    const team = TeamFactory.createTestTeam(RosterName.NURGLE, "Nurgle", 0x556b2f);
    const before = team.players.length;
    const added = addReserveLineman(team);

    expect(added).not.toBeNull();
    expect(team.players.length).toBe(before + 1);
    expect(added!.status).toBe(PlayerStatus.RESERVE);
    expect(added!.gridPosition).toBeUndefined();
    expect(added!.keywords).toContain(PositionKeyWord.LINEMAN);
    // A unique jersey number, so the new player's id does not collide
    expect(team.players.filter((p) => p.id === added!.id)).toHaveLength(1);
  });
});
