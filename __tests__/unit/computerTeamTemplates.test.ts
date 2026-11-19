import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: () => false,
  getDb: vi.fn(),
}));

import { COMPUTER_TEAM_CATALOGUE } from "../../src/data/computerTeamCatalogue";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../src/competition/computerTeamTemplates";
import {
  checkTeamCompatibility,
  createRosterRuleProfile,
} from "../../src/competition/rosterRules";
import { createCompetition } from "../../src/competition/create";
import {
  getTeamById,
  loadTeams,
  saveTeam,
} from "../../src/game/managers/TeamManager";
import {
  DEFAULT_SEVENS_RULESET,
  NAF_SEVENS_RULESET,
} from "../../src/game/rules/sevensRuleset";
import { RosterName, type TeamAdvancementMode } from "../../src/types/Team";
import { manageComputerTeam } from "../../src/competition/computerTeams";
import { RNGService } from "../../src/services/rng/RNGService";

beforeEach(() => {
  localStorage.clear();
});

describe("computer team templates", () => {
  it("is available without seeding or saving teams, with distinct identities", () => {
    const templates = getComputerTeamTemplates();
    expect(templates).toHaveLength(81);
    expect(new Set(templates.map((template) => template.rosterName)).size).toBe(
      30
    );
    expect(
      new Set(COMPUTER_TEAM_CATALOGUE.map((template) => template.id)).size
    ).toBe(82);
    expect(
      new Set(COMPUTER_TEAM_CATALOGUE.map((template) => template.name)).size
    ).toBe(82);
    expect(
      new Set(
        COMPUTER_TEAM_CATALOGUE.map((template) => template.colors.primary)
      ).size
    ).toBe(82);
    expect(loadTeams()).toEqual([]);
  });

  it("builds the sourced Human lineup at current prices", () => {
    const team = createComputerTeamFromTemplate("human-reroll-mix-roster");
    expect(team.name).toBe("Altdorf All Sorts");
    expect(team.players.map((player) => player.positionName)).toEqual([
      "Human Lineman",
      "Human Lineman",
      "Human Lineman",
      "Human Blitzer",
      "Human Blitzer",
      "Human Thrower",
      "Human Catcher",
    ]);
    expect(team.rerolls).toBe(1);
    expect(team.treasury).toBe(30_000);
    expect(team.teamValue).toBe(570_000);
    expect(team.players.filter((player) => player.veteran)).toHaveLength(1);
    expect(team.advancementMode).toBeUndefined();
    expect(team.activeCompetitionId).toBeUndefined();
  });

  it("only offers Max snots under rules that permit its draft", () => {
    const id = "snotling-max-snots";
    expect(
      getComputerTeamTemplates(DEFAULT_SEVENS_RULESET).some(
        (template) => template.id === id
      )
    ).toBe(false);
    expect(getComputerTeamTemplates(NAF_SEVENS_RULESET)).toHaveLength(82);
    expect(() => createComputerTeamFromTemplate(id)).toThrow(
      "Too many Insignificant"
    );
    const team = createComputerTeamFromTemplate(id, {
      ruleset: NAF_SEVENS_RULESET,
    });
    expect(team.players).toHaveLength(11);
    expect(team.treasury).toBe(60_000);
  });

  const modes: TeamAdvancementMode[] = [
    "advanced-league",
    "sevens-skill-selection",
    "matched-play",
  ];
  it.each(modes)(
    "every offered build passes the real %s entry gate in both rulesets",
    (advancementMode) => {
      const profile = createRosterRuleProfile({
        advancementMode,
        draftBudget: 600_000,
      });
      for (const ruleset of [DEFAULT_SEVENS_RULESET, NAF_SEVENS_RULESET] as const) {
        const failures = getComputerTeamTemplates(ruleset).flatMap(
          (template) => {
            const team = createComputerTeamFromTemplate(template.id, {
              ruleset,
              advancementMode,
            });
            const { reasons } = checkTeamCompatibility(team, profile, ruleset);
            return reasons.map((reason) => `${template.name}: ${reason}`);
          }
        );
        expect(failures).toEqual([]);
      }
    }
  );

  it("gives each league a separate copy with its progression mode and durable provenance", async () => {
    const entrants = [
      { computerTemplateId: "human-reroll-mix-roster" },
      { computerTemplateId: "orc-reroll-roster" },
    ];
    const first = await createCompetition({
      type: "league",
      name: "Old season",
      organizerUid: null,
      entrants,
      profile: createRosterRuleProfile({ advancementMode: "advanced-league" }),
    });
    const second = await createCompetition({
      type: "league",
      name: "New season",
      organizerUid: null,
      entrants,
      profile: createRosterRuleProfile({
        advancementMode: "sevens-skill-selection",
      }),
    });
    const oldTeam = fixtureValue(getTeamById(fixtureValue(first.entrants[0]).teamId));
    const newTeam = fixtureValue(getTeamById(fixtureValue(second.entrants[0]).teamId));
    expect(oldTeam.id).not.toBe(newTeam.id);
    expect(
      new Set(
        [...oldTeam.players, ...newTeam.players].map((player) => player.id)
      ).size
    ).toBe(14);
    expect(oldTeam.advancementMode).toBe("advanced-league");
    expect(newTeam.advancementMode).toBe("sevens-skill-selection");
    expect(newTeam.advancementModeLocked).toBe(true);
    expect(newTeam.activeCompetitionId).toBe(second.id);
    expect(newTeam.computerTemplateId).toBe("human-reroll-mix-roster");
    oldTeam.firstMatchPlayedAt = 1;
    fixtureValue(oldTeam.players[0]).spp = 6;
    manageComputerTeam(oldTeam, new RNGService(7));
    saveTeam(oldTeam);
    expect(fixtureValue(fixtureValue(getTeamById(oldTeam.id)).players[0]).advancements).toHaveLength(1);
    expect(fixtureValue(fixtureValue(getTeamById(newTeam.id)).players[0]).advancements).toEqual([]);
    expect(
      fixtureValue(createComputerTeamFromTemplate("human-reroll-mix-roster").players[0])
        .advancements
    ).toEqual([]);
    expect(loadTeams()).toHaveLength(4);
  });

  it("does not share mutable player data between copies or roster definitions", () => {
    const first = createComputerTeamFromTemplate("human-reroll-mix-roster");
    const second = createComputerTeamFromTemplate("human-reroll-mix-roster");
    fixtureValue(first.players[0]).stats.ST = 1;
    fixtureValue(first.players[0]).keywords.length = 0;
    first.colors.primary = 0;
    expect(fixtureValue(second.players[0]).stats.ST).toBe(3);
    expect(fixtureValue(second.players[0]).keywords.length).toBeGreaterThan(0);
    const fresh = createComputerTeamFromTemplate("human-reroll-mix-roster");
    expect(fresh.rosterName).toBe(RosterName.HUMAN);
    expect(fixtureValue(fresh.players[0]).stats.ST).toBe(3);
    expect(fixtureValue(fresh.players[0]).keywords.length).toBeGreaterThan(0);
    expect(fresh.colors.primary).not.toBe(0);
  });
});
