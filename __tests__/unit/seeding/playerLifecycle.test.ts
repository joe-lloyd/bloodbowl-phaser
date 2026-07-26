import { describe, it, expect } from "vitest";
import { RosterName } from "../../../src/types/Team";
import { InjuryType, PlayerStatus } from "../../../src/types/Player";
import { buildAllSeedTeams } from "../../../src/seeding/teamFixtures";
import {
  careerStatsFor,
  decorateSeedTeams,
} from "../../../src/seeding/playerLifecycle";

function decorated() {
  const teams = buildAllSeedTeams();
  decorateSeedTeams(teams);
  return teams;
}

const careerSpp = (p: {
  completions: number;
  interceptions: number;
  casualties: number;
  touchdowns: number;
  mvps: number;
}) =>
  p.completions + p.interceptions * 2 + p.casualties * 2 + p.touchdowns * 3 + p.mvps * 4;

describe("playerLifecycle", () => {
  it("produces a capped Legend through the progression services", () => {
    const orc = decorated().find((t) => t.rosterName === RosterName.ORC)!;
    const legend = orc.players.find((p) => p.careerStats)!;
    expect(legend.advancements).toHaveLength(6);
    expect(legend.level).toBe(6);
    expect(legend.careerStats!.sppEarned).toBe(
      legend.advancements!.reduce((s, a) => s + a.sppCost, 0)
    );
    expect(careerSpp(legend.careerStats!)).toBe(legend.careerStats!.sppEarned);
    // Value increases accumulated on the player
    expect(legend.teamValue).toBeGreaterThan(0);
  });

  it("produces an SPP-earning player with no advancements", () => {
    const human = decorated().find((t) => t.rosterName === RosterName.HUMAN)!;
    const earner = human.players.find(
      (p) => p.careerStats && (p.advancements ?? []).length === 0 && p.spp > 0
    )!;
    expect(earner.careerStats!.sppEarned).toBe(earner.spp);
    expect(careerSpp(earner.careerStats!)).toBe(earner.spp);
  });

  it("produces a multi-advancement player with coherent history", () => {
    const human = decorated().find((t) => t.rosterName === RosterName.HUMAN)!;
    const veteran = human.players.find(
      (p) => (p.advancements ?? []).length === 3
    )!;
    const spent = veteran.advancements!.reduce((s, a) => s + a.sppCost, 0);
    expect(veteran.careerStats!.sppEarned).toBe(spent + veteran.spp);
    expect(veteran.level).toBe(3);
  });

  it("produces injured players, including stat decreases", () => {
    const human = decorated().find((t) => t.rosterName === RosterName.HUMAN)!;
    const hurt = human.players.find((p) =>
      p.injuries.includes(InjuryType.MISS_NEXT_GAME)
    )!;
    expect(hurt.status).toBe(PlayerStatus.RESERVE);

    const dwarf = decorated().find((t) => t.rosterName === RosterName.DWARF)!;
    const decreased = dwarf.players.find((p) =>
      p.injuries.includes(InjuryType.STAT_DECREASE_MA)
    )!;
    expect(decreased.stats.MA).toBe(decreased.baseStats.MA - 1);
  });

  it("leaves every undecorated player a rookie", () => {
    for (const team of decorated()) {
      for (const player of team.players.filter((p) => !p.careerStats)) {
        expect(player.spp).toBe(0);
        expect(player.advancements ?? []).toHaveLength(0);
        expect(player.level).toBe(0);
      }
    }
  });

  it("careerStatsFor decomposes SPP canonically", () => {
    const stats = careerStatsFor(38, 6);
    expect(stats.sppEarned).toBe(38);
    expect(careerSpp(stats)).toBe(38);
    expect(stats.mvps).toBeLessThanOrEqual(stats.matches);
  });
});
