import { describe, expect, it } from "vitest";
import {
  dehydratePlayer,
  dehydrateTeam,
  hydratePlayer,
  hydrateStoredTeam,
  readStoredTeam,
  TEAM_SCHEMA_VERSION,
} from "../../../src/data/persistence/teamPersistence";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../../src/data/RosterTemplates";
import { createPlayer, InjuryType, Player } from "../../../src/types/Player";
import {
  calculateTeamValue,
  createTeam,
  RosterName,
  Team,
} from "../../../src/types/Team";
import {
  applyAdvancement,
  eligibleSkills,
} from "../../../src/game/progression/progression";

function buildTeam(rosterName: RosterName): Team {
  const roster = getRosterByRosterName(rosterName);
  const team = createTeam(`${rosterName} Test`, rosterName, {
    primary: 0,
    secondary: 0,
  }, roster.rerollCost);
  team.players = roster.playerTemplates.map((template, index) =>
    createPlayer(template, team.id, index + 1)
  );
  team.teamValue = calculateTeamValue(team);
  return team;
}

describe("dehydrate/hydrate round trip", () => {
  for (const rosterName of getAvailableRosterNames()) {
    it(`round-trips every position on the ${rosterName} roster`, () => {
      const team = buildTeam(rosterName);
      for (const player of team.players) {
        const stored = dehydratePlayer(player);
        const warnings: string[] = [];
        const hydrated = hydratePlayer(stored, team.id, rosterName, warnings);
        expect(warnings).toEqual([]);
        expect(hydrated.stats).toEqual(player.stats);
        expect(hydrated.baseStats).toEqual(player.baseStats);
        expect(hydrated.keywords).toEqual(player.keywords);
        expect(hydrated.primary).toEqual(player.primary);
        expect(hydrated.secondary).toEqual(player.secondary);
        expect(hydrated.cost).toBe(player.cost);
        expect(hydrated.teamValue).toBe(player.teamValue);
        expect(hydrated.spp).toBe(player.spp);
        expect(hydrated.level).toBe(player.level);
        expect(hydrated.injuries).toEqual(player.injuries);
        expect(hydrated.skills.map((s) => s.type).sort()).toEqual(
          player.skills.map((s) => s.type).sort()
        );
      }
    });
  }

  it("round-trips a progressed and injured player exactly", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    const player = team.players.find(
      (candidate) => candidate.primary && candidate.primary.length > 0
    )!;
    player.spp = 1000;
    const [skill] = eligibleSkills(player, player.primary ?? []);
    applyAdvancement(player, { kind: "chosen-primary", skill });
    player.characteristicAdvances = { MA: 1 };
    player.stats.MA += 1;
    player.injuries.push(InjuryType.STAT_DECREASE_AV);
    player.stats.AV -= 1;

    const stored = dehydratePlayer(player);
    const warnings: string[] = [];
    const hydrated = hydratePlayer(stored, team.id, team.rosterName, warnings);
    expect(warnings).toEqual([]);
    expect(hydrated.stats).toEqual(player.stats);
    expect(hydrated.advancements).toEqual(player.advancements);
    expect(hydrated.teamValue).toBe(player.teamValue);
    expect(hydrated.characteristicAdvances).toEqual(
      player.characteristicAdvances
    );
    expect(hydrated.injuries).toEqual(player.injuries);
  });

  it("degrades an unknown position to a marked placeholder without losing progression", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    const player = team.players[0];
    player.spp = 12;
    player.injuries.push(InjuryType.NIGGLING_INJURY);
    const stored = dehydratePlayer(player);
    stored.positionName = "Not A Real Position";

    const warnings: string[] = [];
    const hydrated = hydratePlayer(stored, team.id, team.rosterName, warnings);

    expect(warnings.length).toBe(1);
    expect(hydrated.hydrationWarning).toBeTruthy();
    expect(hydrated.spp).toBe(12);
    expect(hydrated.injuries).toEqual(player.injuries);
    expect(hydrated.id).toBe(player.id);
  });

  it("never persists derivable fields on a dehydrated player", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    const stored = dehydratePlayer(team.players[0]);
    expect(stored).not.toHaveProperty("stats");
    expect(stored).not.toHaveProperty("baseStats");
    expect(stored).not.toHaveProperty("skills");
    expect(stored).not.toHaveProperty("keywords");
    expect(stored).not.toHaveProperty("cost");
    expect(stored).not.toHaveProperty("teamValue");
    expect(stored).not.toHaveProperty("status");
    expect(stored).not.toHaveProperty("gridPosition");
    expect(stored).not.toHaveProperty("hasActed");
  });
});

describe("team hydration and the tolerant reader", () => {
  it("recomputes team value on load rather than trusting the stored value", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    const stored = dehydrateTeam(team);
    const raw = JSON.parse(JSON.stringify(stored));
    const { team: reloaded } = hydrateStoredTeam(raw);
    expect(reloaded.teamValue).toBe(calculateTeamValue(reloaded));
    expect(reloaded.teamValue).toBe(team.teamValue);
  });

  it("writes the current schema version", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    const stored = dehydrateTeam(team);
    expect(stored.schemaVersion).toBe(TEAM_SCHEMA_VERSION);
  });

  it("reads a legacy full-object document (no schemaVersion) and hydrates it fresh", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    // The previous shape: the entire runtime Team, JSON round-tripped.
    const legacyDoc = JSON.parse(JSON.stringify(team));
    expect(legacyDoc.schemaVersion).toBeUndefined();

    const { team: reloaded, warnings } = readStoredTeam(legacyDoc);
    expect(warnings).toEqual([]);
    expect(reloaded.name).toBe(team.name);
    expect(reloaded.players).toHaveLength(team.players.length);
    expect(reloaded.teamValue).toBe(calculateTeamValue(reloaded));
    reloaded.players.forEach((player: Player, index: number) => {
      expect(player.stats).toEqual(team.players[index].stats);
      expect(player.skills.map((s) => s.type).sort()).toEqual(
        team.players[index].skills.map((s) => s.type).sort()
      );
    });
  });

  it("re-saves a converted legacy document in the normalized shape", () => {
    const team = buildTeam(getAvailableRosterNames()[0]);
    const legacyDoc = JSON.parse(JSON.stringify(team));
    const { team: reloaded } = readStoredTeam(legacyDoc);
    const resaved = dehydrateTeam(reloaded);
    expect(resaved.schemaVersion).toBe(TEAM_SCHEMA_VERSION);
    expect(resaved.players[0]).not.toHaveProperty("stats");
  });
});
