import { describe, expect, it } from "vitest";
import { EventBus } from "../../services/EventBus";
import { Player, PlayerStatus, PlayerStats } from "../../types/Player";
import { Team } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import { MatchStats } from "./MatchStats";

const baseStats: PlayerStats = { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 };

function player(id: string, teamId: string): Player {
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
    primary: [],
    secondary: [],
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

describe("MatchStats — concession bookkeeping (no artificial touchdown)", () => {
  it("assigning a concession-awarded touchdown grants SPP without inflating the touchdown statistic", () => {
    const eventBus = new EventBus();
    const scorer = player("p1", "team-1");
    const teams = [team("team-1", [scorer]), team("team-2", [])];
    const stats = new MatchStats(eventBus, teams, true);
    eventBus.emit(GameEventNames.PlayerActivated, "p1");

    stats.assignAwardedTouchdown("p1");

    const summary = stats.summary(teams.flatMap((t) => t.players));
    const entry = summary.players.find((p) => p.playerId === "p1")!;
    expect(entry.touchdowns).toBe(0);
    expect(entry.awardedTouchdownSpp).toBe(1);
    expect(entry.sppEarned).toBe(3); // touchdown-value SPP, not a real touchdown
  });

  it("zeroes the conceding team's SPP consistently across repeated summary() calls (idempotent across rerender/resume)", () => {
    const eventBus = new EventBus();
    const p1 = player("p1", "team-1");
    const p2 = player("p2", "team-2");
    const teams = [team("team-1", [p1]), team("team-2", [p2])];
    const stats = new MatchStats(eventBus, teams, true);
    eventBus.emit(GameEventNames.PlayerActivated, "p1");
    eventBus.emit(GameEventNames.PlayerActivated, "p2");
    eventBus.emit(GameEventNames.PassCompleted, { playerId: "p1", catcherId: "p1", position: { x: 0, y: 0 } });
    eventBus.emit(GameEventNames.PassCompleted, { playerId: "p2", catcherId: "p2", position: { x: 0, y: 0 } });

    stats.applySpp(teams, "team-1");

    // Calling summary() again (as a rerender/resume would) must keep
    // agreeing that team-1 was zeroed, not just the one-off return value.
    for (let i = 0; i < 3; i++) {
      const summary = stats.summary(teams.flatMap((t) => t.players));
      expect(summary.players.find((p) => p.playerId === "p1")?.sppEarned).toBe(
        0
      );
      expect(summary.players.find((p) => p.playerId === "p2")?.sppEarned).toBe(
        1
      );
    }
    expect(p1.spp).toBe(0);
    expect(p2.spp).toBe(1);
  });

  it("throws rather than re-crediting SPP on a second applySpp call", () => {
    const eventBus = new EventBus();
    const p1 = player("p1", "team-1");
    const teams = [team("team-1", [p1]), team("team-2", [])];
    const stats = new MatchStats(eventBus, teams, true);
    expect(stats.applied).toBe(false);

    stats.applySpp(teams);
    expect(stats.applied).toBe(true);
    expect(() => stats.applySpp(teams)).toThrow(
      "Match SPP has already been applied"
    );
  });

  it("restoreState preserves the applied flag and conceding team so summary() stays idempotent after a reload", () => {
    const eventBus = new EventBus();
    const p1 = player("p1", "team-1");
    const teams = [team("team-1", [p1]), team("team-2", [])];
    const stats = new MatchStats(eventBus, teams, true);
    eventBus.emit(GameEventNames.PlayerActivated, "p1");
    eventBus.emit(GameEventNames.PassCompleted, { playerId: "p1", catcherId: "p1", position: { x: 0, y: 0 } });
    stats.applySpp(teams, "team-1");
    const snapshot = stats.captureState();

    const restored = new MatchStats(new EventBus(), teams, true);
    restored.restoreState(snapshot);

    expect(restored.applied).toBe(true);
    const summary = restored.summary(teams.flatMap((t) => t.players));
    expect(summary.players.find((p) => p.playerId === "p1")?.sppEarned).toBe(
      0
    );
  });
});
