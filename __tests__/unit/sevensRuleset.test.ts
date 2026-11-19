import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCompetition } from "../../src/competition/create";
import {
  getCompetition,
  saveCompetition,
  updateCompetition,
} from "../../src/competition/repository";
import {
  assertEntrantsCompatible,
  checkTeamCompatibility,
  createRosterRuleProfile,
} from "../../src/competition/rosterRules";
import {
  dehydrateTeam,
  hydrateStoredTeam,
} from "../../src/data/persistence/teamPersistence";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import {
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
  readSevensRuleset,
} from "../../src/game/rules/sevensRuleset";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { createPlayer } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: () => false,
  getDb: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
});

function nafRoster() {
  const team = createReadyMadeTeam(RosterName.SNOTLING, "NAF Snots", 1);
  const template = getRosterByRosterName(RosterName.SNOTLING)
    .playerTemplates[0];
  team.players.push(createPlayer(fixtureValue(template), team.id, team.players.length + 1));
  team.treasury -= fixtureValue(template).cost;
  team.draftRuleset = NAF_SEVENS_RULESET;
  team.advancementMode = "advanced-league";
  return team;
}

describe("GW baseline and dated NAF Sevens rulings", () => {
  it("enforces Insignificant by default and ignores it only for the selected NAF option", () => {
    const team = nafRoster();
    expect(validateInsignificant(team.players)).toContain(
      "Too many Insignificant"
    );
    expect(validateInsignificant(team.players, NAF_SEVENS_RULESET)).toBeNull();
    const profile = createRosterRuleProfile({
      advancementMode: fixtureValue(team.advancementMode),
    });
    expect(checkTeamCompatibility(team, profile).compatible).toBe(false);
    expect(checkTeamCompatibility(team, profile, NAF_SEVENS_RULESET)).toEqual({
      compatible: true,
      reasons: [],
    });
  });

  it.each(["league", "tournament"] as const)(
    "stores the chosen NAF rules for a whole %s and applies them at entry",
    async (type) => {
      const team = nafRoster();
      const opponent = createReadyMadeTeam(RosterName.HUMAN, "Visitors", 2);
      const input = {
        type,
        name: "NAF event",
        organizerUid: null,
        entrants: [team, opponent].map((team) => ({ team, ownerUid: null })),
      };
      await expect(createCompetition(input)).rejects.toThrow("not legal");
      expect(team.activeCompetitionId).toBeUndefined();
      const competition = await createCompetition({
        ...input,
        ruleset: NAF_SEVENS_RULESET,
      });
      expect((await getCompetition(type, competition.id))?.ruleset).toBe(
        "naf-sevens-2026-09-26"
      );
      expect(team.activeCompetitionId).toBe(competition.id);
    }
  );

  it("still refuses other roster violations with NAF enabled", async () => {
    const team = nafRoster();
    team.treasury = -1;
    expect(() => {
      assertEntrantsCompatible([team], undefined, NAF_SEVENS_RULESET);
    }).toThrow("treasury is negative");
    const opponent = createReadyMadeTeam(RosterName.HUMAN, "Visitors", 2);
    await expect(
      createCompetition({
        type: "league",
        name: "Forged",
        organizerUid: null,
        entrants: [team, opponent].map((team) => ({ team, ownerUid: null })),
        ruleset: NAF_SEVENS_RULESET,
      })
    ).rejects.toThrow("not legal");
  });

  it("preserves the draft rules when a team is saved and loaded", () => {
    const team = nafRoster();
    const loaded = hydrateStoredTeam(
      JSON.parse(JSON.stringify(dehydrateTeam(team)))
    ).team;
    expect(loaded.draftRuleset).toBe("naf-sevens-2026-09-26");
    expect(
      validateInsignificant(loaded.players, loaded.draftRuleset)
    ).toBeNull();
    expect(validateInsignificant(loaded.players)).toContain(
      "Too many Insignificant"
    );
  });

  it("uses GW rules for old competitions without changing their stored choice", async () => {
    const competition = await createCompetition({
      type: "league",
      name: "Old",
      organizerUid: null,
      entrants: [RosterName.HUMAN, RosterName.ORC].map((roster) => ({
        team: createReadyMadeTeam(roster, roster, 1),
        ownerUid: null,
      })),
    });
    expect(competition.ruleset).toBe("gw-2025");
    delete competition.ruleset;
    await saveCompetition(competition);
    const loaded = await getCompetition("league", competition.id);
    expect(loaded).not.toHaveProperty("ruleset");
    expect(readSevensRuleset(loaded?.ruleset)).toBe("gw-2025");
    await updateCompetition("league", competition.id, (latest) => ({
      ...latest,
      name: "Renamed legacy league",
    }));
    const stored = JSON.parse(fixtureValue(localStorage.getItem("bloodbowl_competitions")));
    expect(stored[`league:${competition.id}`]).toMatchObject({
      name: "Renamed legacy league",
    });
    expect(stored[`league:${competition.id}`]).not.toHaveProperty("ruleset");
  });

  it("keeps a season's choice fixed when it is saved or updated", async () => {
    const competition = await createCompetition({
      type: "league",
      name: "Fixed rules",
      organizerUid: null,
      entrants: [RosterName.HUMAN, RosterName.ORC].map((roster) => ({
        team: createReadyMadeTeam(roster, roster, 1),
        ownerUid: null,
      })),
      ruleset: NAF_SEVENS_RULESET,
    });
    await expect(
      saveCompetition({ ...competition, ruleset: DEFAULT_SEVENS_RULESET })
    ).rejects.toThrow("cannot change");
    await expect(
      updateCompetition("league", competition.id, (latest) => {
        latest.ruleset = DEFAULT_SEVENS_RULESET;
        return latest;
      })
    ).rejects.toThrow("cannot change");
    expect((await getCompetition("league", competition.id))?.ruleset).toBe(
      "naf-sevens-2026-09-26"
    );
  });

  it("refuses an unknown profile rather than silently adopting different rules", () => {
    expect(readSevensRuleset(undefined)).toBe("gw-2025");
    expect(() => readSevensRuleset("naf-latest")).toThrow(
      "Unknown Sevens ruleset"
    );
  });
});
