import { describe, expect, it } from "vitest";
import { EventBus } from "../../services/EventBus";
import { Player, PlayerStatus, PlayerStats } from "../../types/Player";
import { SkillCategory, SkillType } from "../../types/Skills";
import { Team } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import {
  ADVANCEMENT_COSTS,
  applyAdvancement,
  characteristicChoices,
  rollSkill,
} from "./progression";
import { MatchStats, PlayerMatchStats, sppFromMatchStats } from "./MatchStats";

const baseStats: PlayerStats = { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 };

function player(
  id: string,
  teamId = "team-1",
  kind: Player["playerKind"] = "roster"
): Player {
  return {
    id,
    playerName: id,
    positionName: "Lineman",
    number: Number(id.replace(/\D/g, "")) || 1,
    keywords: [],
    teamId,
    stats: { ...baseStats },
    baseStats: { ...baseStats },
    skills: [],
    primary: [SkillCategory.GENERAL, SkillCategory.AGILITY],
    secondary: [SkillCategory.STRENGTH],
    spp: 0,
    level: 0,
    playerKind: kind,
    advancements: [],
    characteristicAdvances: {},
    status: PlayerStatus.RESERVE,
    injuries: [],
    hasActed: false,
    cost: 50_000,
    teamValue: 0,
  };
}

function team(id: string, players: Player[]): Team {
  return { id, players } as Team;
}

function stats(overrides: Partial<PlayerMatchStats>): PlayerMatchStats {
  return {
    playerId: "p1",
    teamId: "team-1",
    participated: true,
    completions: 0,
    attempts: 0,
    superbThrows: 0,
    safeLandings: 0,
    interceptions: 0,
    casualties: 0,
    kills: 0,
    touchdowns: 0,
    mvps: 0,
    blocks: 0,
    yards: 0,
    injuriesSuffered: 0,
    sppEarned: 0,
    ...overrides,
  };
}

describe("2025 progression rules", () => {
  it("uses the exact six advancement bands", () => {
    expect(ADVANCEMENT_COSTS).toEqual([
      {
        randomPrimary: 3,
        chosenPrimary: 6,
        chosenSecondary: 10,
        characteristic: 14,
      },
      {
        randomPrimary: 4,
        chosenPrimary: 8,
        chosenSecondary: 12,
        characteristic: 16,
      },
      {
        randomPrimary: 6,
        chosenPrimary: 12,
        chosenSecondary: 16,
        characteristic: 20,
      },
      {
        randomPrimary: 8,
        chosenPrimary: 16,
        chosenSecondary: 20,
        characteristic: 24,
      },
      {
        randomPrimary: 10,
        chosenPrimary: 20,
        chosenSecondary: 24,
        characteristic: 28,
      },
      {
        randomPrimary: 15,
        chosenPrimary: 30,
        chosenSecondary: 34,
        characteristic: 38,
      },
    ]);
  });

  it("calculates the supplied combined SPP example", () => {
    expect(
      sppFromMatchStats(
        stats({ completions: 2, casualties: 1, touchdowns: 1, mvps: 1 })
      )
    ).toBe(11);
  });

  it("maps both halves of the random skill table", () => {
    expect(rollSkill(SkillCategory.AGILITY, 1, 4)).toBe(SkillType.DODGE);
    expect(rollSkill(SkillCategory.AGILITY, 4, 2)).toBe(SkillType.LEAP);
    expect(rollSkill(SkillCategory.STRENGTH, 6, 2)).toBe(SkillType.MIGHTY_BLOW);
  });

  it("applies Elite Primary value and prevents duplicate skill choices", () => {
    const subject = player("p1");
    subject.spp = 6;
    applyAdvancement(subject, {
      kind: "chosen-primary",
      skill: SkillType.BLOCK,
    });
    expect(subject.spp).toBe(0);
    expect(subject.teamValue).toBe(30_000);
    expect(subject.level).toBe(1);
    subject.spp = 8;
    expect(() =>
      applyAdvancement(subject, {
        kind: "chosen-primary",
        skill: SkillType.BLOCK,
      })
    ).toThrow(/legal primary/);
  });

  it("filters characteristic choices by roll, maximum and twice-only cap", () => {
    const subject = player("p1");
    subject.stats.AG = 1;
    subject.characteristicAdvances = { MA: 2 };
    expect(characteristicChoices(subject, 8)).toEqual(["ST", "PA", "AV"]);
  });
});

describe("match SPP tracking", () => {
  it("credits only direct standard outcomes and survives casualty recovery timing", () => {
    const bus = new EventBus();
    const scorer = player("p1");
    const victim = player("p2", "team-2");
    const tracker = new MatchStats(
      bus,
      [team("team-1", [scorer]), team("team-2", [victim])],
      true
    );

    bus.emit(GameEventNames.PassCompleted, {
      playerId: scorer.id,
      catcherId: "p3",
      position: { x: 1, y: 1 },
    });
    bus.emit(GameEventNames.PlayerCasualtyInflicted, {
      causerId: scorer.id,
      victimId: victim.id,
      cause: "block",
      sppEligible: true,
    });
    bus.emit(GameEventNames.PlayerCasualtyInflicted, {
      causerId: scorer.id,
      victimId: victim.id,
      cause: "special",
      sppEligible: false,
    });
    bus.emit(GameEventNames.ThrowTeammateLanded, {
      throwerId: scorer.id,
      thrownPlayerId: victim.id,
      safeLanding: true,
      superbThrow: true,
    });

    const summary = tracker.summary([scorer, victim]);
    expect(
      summary.players.find((entry) => entry.playerId === scorer.id)
    ).toMatchObject({
      completions: 1,
      casualties: 1,
      superbThrows: 1,
      sppEarned: 4,
    });
    expect(
      summary.players.find((entry) => entry.playerId === victim.id)
    ).toMatchObject({
      safeLandings: 1,
      injuriesSuffered: 2,
      sppEarned: 1,
    });
  });

  it("awards Journeymen but never Star Players and applies only once", () => {
    const bus = new EventBus();
    const star = player("p1", "team-1", "star");
    const journeyman = player("p2", "team-1", "journeyman");
    const roster = team("team-1", [star, journeyman]);
    const tracker = new MatchStats(bus, [roster], true);
    [star, journeyman].forEach((subject) =>
      bus.emit(GameEventNames.Touchdown, {
        teamId: roster.id,
        score: 1,
        scorerId: subject.id,
      })
    );

    tracker.applySpp([roster]);
    expect(star.spp).toBe(0);
    expect(journeyman.spp).toBe(3);
    expect(() => tracker.applySpp([roster])).toThrow(/already/);
  });

  it("does not award SPP in a friendly", () => {
    const bus = new EventBus();
    const subject = player("p1");
    const roster = team("team-1", [subject]);
    const tracker = new MatchStats(bus, [roster], false);
    bus.emit(GameEventNames.PassIntercepted, {
      passerId: "opponent",
      interceptorId: subject.id,
      position: { x: 1, y: 1 },
    });
    tracker.applySpp([roster]);
    expect(subject.spp).toBe(0);
  });
});
