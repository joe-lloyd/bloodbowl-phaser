import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { Player, PlayerStatus } from "../../src/types/Player";
import { Team } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";
import { MatchStats } from "../../src/game/progression/MatchStats";
import {
  foldMatchStatsIntoCareer,
  foldMatchSummaryIntoCareers,
} from "../../src/game/progression/careerStats";

function player(id: string, teamId = "team-1"): Player {
  return {
    id,
    playerName: id,
    positionName: "Lineman",
    number: 1,
    keywords: [],
    teamId,
    stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
    baseStats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
    skills: [],
    spp: 0,
    level: 0,
    playerKind: "roster",
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

describe("career stats fold", () => {
  it("does not credit a game to a player who never took the field", () => {
    const p = player("p1");
    foldMatchStatsIntoCareer(p, {
      playerId: "p1",
      teamId: "team-1",
      participated: false,
      completions: 3,
      attempts: 3,
      superbThrows: 0,
      safeLandings: 0,
      interceptions: 0,
      casualties: 0,
      kills: 0,
      touchdowns: 1,
      mvps: 0,
      blocks: 0,
      yards: 5,
      injuriesSuffered: 0,
      sppEarned: 6,
    });
    expect(p.careerStats).toBeUndefined();
  });

  it("accumulates every counter, including kills and squares moved, across matches", () => {
    const p = player("p1");
    const matchOne = {
      playerId: "p1",
      teamId: "team-1",
      participated: true,
      completions: 2,
      attempts: 3,
      superbThrows: 0,
      safeLandings: 0,
      interceptions: 1,
      casualties: 1,
      kills: 1,
      touchdowns: 1,
      mvps: 0,
      blocks: 2,
      yards: 8,
      injuriesSuffered: 0,
      sppEarned: 8,
    };
    foldMatchStatsIntoCareer(p, matchOne);
    foldMatchStatsIntoCareer(p, { ...matchOne, kills: 0, casualties: 0 });

    expect(p.careerStats).toMatchObject({
      matches: 2,
      completions: 4,
      passesAttempted: 6,
      interceptions: 2,
      casualties: 1,
      kills: 1,
      touchdowns: 2,
      squaresMoved: 16,
      sppEarned: 16,
    });
    // A kill is a subset of casualties, never double-counted against it.
    expect(p.careerStats!.kills).toBeLessThanOrEqual(p.careerStats!.casualties);
  });

  it("folds a whole match summary across both teams by player id", () => {
    const home = player("home-1", "home");
    const away = player("away-1", "away");
    const teams = [team("home", [home]), team("away", [away])];
    foldMatchSummaryIntoCareers(teams, {
      progressionEnabled: true,
      players: [
        {
          playerId: "home-1",
          teamId: "home",
          participated: true,
          completions: 1,
          attempts: 1,
          superbThrows: 0,
          safeLandings: 0,
          interceptions: 0,
          casualties: 0,
          kills: 0,
          touchdowns: 1,
          mvps: 0,
          blocks: 0,
          yards: 3,
          injuriesSuffered: 0,
          sppEarned: 4,
        },
        {
          playerId: "away-1",
          teamId: "away",
          participated: false,
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
        },
      ],
    });
    expect(home.careerStats?.matches).toBe(1);
    expect(away.careerStats).toBeUndefined();
  });
});

describe("kills are tracked separately from casualties, from the event bus", () => {
  it("counts a kill when a casualty's injury result is death", () => {
    const bus = new EventBus();
    const attacker = player("attacker");
    const victim = player("victim");
    const stats = new MatchStats(bus, [team("t1", [attacker, victim])], true);

    bus.emit(GameEventNames.PlayerCasualtyInflicted, {
      causerId: "attacker",
      victimId: "victim",
      cause: "block",
      sppEligible: true,
    });
    bus.emit(GameEventNames.PlayerKilled, {
      causerId: "attacker",
      victimId: "victim",
    });

    const summary = stats.summary();
    const attackerStats = summary.players.find((p) => p.playerId === "attacker");
    expect(attackerStats?.casualties).toBe(1);
    expect(attackerStats?.kills).toBe(1);
  });
});
