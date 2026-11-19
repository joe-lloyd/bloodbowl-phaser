import { describe, expect, it } from "vitest";
import {
  League,
  RosterName,
  TeamSpecialRule,
  createTeam,
} from "../../../src/types/Team";
import {
  chooseFavouredOf,
  chooseLeague,
  favouredOfChoices,
  teamLeague,
  teamSpecialRules,
} from "../../../src/game/rules/teamAllegiance";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";
import { sevensInducementCatalog } from "../../../src/game/inducements/catalog";
import { Inducement } from "../../../src/types/Inducements";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../../src/data/persistence/teamPersistence";

const teamOf = (rosterName: RosterName) =>
  createTeam("Test", rosterName, { primary: 0, secondary: 0 }, 0);

const sells = (team: ReturnType<typeof teamOf>, inducement: Inducement) =>
  sevensInducementCatalog(team).some((line) => line.inducement === inducement);

describe("choosing a League", () => {
  it("defaults to the roster's first League", () => {
    expect(teamLeague(teamOf(RosterName.OGRE))).toBe(League.BADLANDS_BRAWL);
  });

  it("gives a Norse team Favoured of Khorne in the Chaos Clash only", () => {
    const team = teamOf(RosterName.NORSE);

    expect(chooseLeague(team, League.OLD_WORLD_CLASSIC)).toEqual({
      allowed: true,
    });
    expect(teamSpecialRules(team)).toEqual([]);

    chooseLeague(team, League.CHAOS_CLASH);
    expect(teamSpecialRules(team)).toEqual([
      TeamSpecialRule.FAVOURED_OF_KHORNE,
    ]);
  });

  it("refuses a League the roster does not list", () => {
    const team = teamOf(RosterName.HUMAN);

    expect(chooseLeague(team, League.CHAOS_CLASH)).toEqual({
      allowed: false,
      reason: "Human teams cannot play in the Chaos Clash.",
    });
    expect(teamLeague(team)).toBe(League.OLD_WORLD_CLASSIC);
  });

  it("refuses a change once the team has played", () => {
    const team = teamOf(RosterName.NORSE);
    stampFirstCompletedMatch(team);

    expect(chooseLeague(team, League.OLD_WORLD_CLASSIC).allowed).toBe(false);
  });
});

describe("choosing an alignment", () => {
  it("lets Chaos Chosen pick any of the six", () => {
    expect(favouredOfChoices(RosterName.CHAOS_CHOSEN)).toEqual([
      TeamSpecialRule.FAVOURED_OF_HASHUT,
      TeamSpecialRule.FAVOURED_OF_KHORNE,
      TeamSpecialRule.FAVOURED_OF_NURGLE,
      TeamSpecialRule.FAVOURED_OF_SLAANESH,
      TeamSpecialRule.FAVOURED_OF_TZEENTCH,
      TeamSpecialRule.FAVOURED_OF_UNDIVIDED,
    ]);
  });

  it("never lets Chaos Renegades pick Hashut", () => {
    const team = teamOf(RosterName.CHAOS_RENEGADE);

    expect(favouredOfChoices(team.rosterName)).not.toContain(
      TeamSpecialRule.FAVOURED_OF_HASHUT
    );
    expect(chooseFavouredOf(team, TeamSpecialRule.FAVOURED_OF_HASHUT)).toEqual({
      allowed: false,
      reason: "Chaos Renegade teams cannot be Favoured of Hashut.",
    });
  });

  it("starts Undivided and offers the Plague Doctor once Nurgle is chosen", () => {
    const team = teamOf(RosterName.CHAOS_RENEGADE);
    expect(teamSpecialRules(team)).toEqual([
      TeamSpecialRule.FAVOURED_OF_UNDIVIDED,
    ]);
    expect(sells(team, Inducement.PLAGUE_DOCTOR)).toBe(false);

    chooseFavouredOf(team, TeamSpecialRule.FAVOURED_OF_NURGLE);

    expect(teamSpecialRules(team)).toEqual([
      TeamSpecialRule.FAVOURED_OF_NURGLE,
    ]);
    expect(sells(team, Inducement.PLAGUE_DOCTOR)).toBe(true);
  });

  it("is offered to no other roster", () => {
    expect(favouredOfChoices(RosterName.NURGLE)).toEqual([]);
    expect(
      chooseFavouredOf(
        teamOf(RosterName.HUMAN),
        TeamSpecialRule.FAVOURED_OF_NURGLE
      ).allowed
    ).toBe(false);
  });
});

describe("saving the choices", () => {
  it("keeps the League and alignment through a save", () => {
    const norse = teamOf(RosterName.NORSE);
    chooseLeague(norse, League.CHAOS_CLASH);
    const chosen = teamOf(RosterName.CHAOS_CHOSEN);
    chooseFavouredOf(chosen, TeamSpecialRule.FAVOURED_OF_TZEENTCH);

    const reload = (team: ReturnType<typeof teamOf>) =>
      readStoredTeam(JSON.parse(JSON.stringify(dehydrateTeam(team)))).team;

    expect(reload(norse).league).toBe(League.CHAOS_CLASH);
    expect(reload(chosen).favouredOf).toBe(
      TeamSpecialRule.FAVOURED_OF_TZEENTCH
    );
  });

  it("drops a stored choice the roster does not offer", () => {
    const stored = {
      ...dehydrateTeam(teamOf(RosterName.CHAOS_RENEGADE)),
      league: League.OLD_WORLD_CLASSIC,
      favouredOf: TeamSpecialRule.FAVOURED_OF_HASHUT,
    };

    const loaded = readStoredTeam(stored).team;

    expect(loaded.league).toBeUndefined();
    expect(loaded.favouredOf).toBeUndefined();
    expect(teamSpecialRules(loaded)).toEqual([
      TeamSpecialRule.FAVOURED_OF_UNDIVIDED,
    ]);
  });
});
