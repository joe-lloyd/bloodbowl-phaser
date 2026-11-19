import { parseJson } from "../../src/boundary/json";
import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { TeamFactory } from "../../src/game/TeamFactory";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { createPlayer, InjuryType } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import {
  RosterName,
  type Team,
  calculateTeamValue,
  hasBlockingPendingDevelopment,
} from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { GamePhase } from "../../src/types/GameState";
import { recordPendingDevelopment } from "../../src/game/progression/postMatch";
import {
  type JourneymanOffer,
  hireJourneyman,
  journeymanHireRefusal,
  releaseJourneyman,
} from "../../src/game/rules/journeymen";
import { draftListPlayers } from "../../src/game/rules/teamPricing";
import {
  dehydrateTeam,
  hydrateStoredTeam,
} from "../../src/data/persistence/teamPersistence";

function team(id: string, size: number, treasury = 0): Team {
  const built = stabilizeIds(
    TeamFactory.createTestTeam(RosterName.HUMAN, id, 0xcc0000),
    id
  );
  const lineman = getRosterByRosterName(RosterName.HUMAN).playerTemplates[0];
  while (built.players.length < size) {
    built.players.push(
      createPlayer(fixtureValue(lineman), id, built.players.length + 1)
    );
  }
  built.players = built.players.slice(0, size);
  built.advancementMode = "sevens-skill-selection";
  built.firstMatchPlayedAt = 1;
  built.treasury = treasury;
  return built;
}

function kickOff(home: Team, leagueFixture = true): HeadlessGame {
  return new HeadlessGame({
    team1: home,
    team2: team("away", 7),
    seed: 1,
    startingPhase: GamePhase.SETUP,
    paysWinnings: leagueFixture,
  });
}

const journeymen = (t: Team) =>
  t.players.filter((p) => p.playerKind === "journeyman");
const offers = (t: Team) =>
  (t.pendingDevelopment ?? []).filter(
    (entry): entry is JourneymanOffer => entry.kind === "journeyman-offer"
  );
const offerFor = (t: Team, playerId: string) =>
  fixtureValue(offers(t).find((entry) => entry.playerId === playerId));
const reload = (saved: Team): Team =>
  hydrateStoredTeam(
    parseJson(
      JSON.stringify(dehydrateTeam(saved)),
      z.record(z.string(), z.unknown())
    )
  ).team;
const loner = (t: Team, playerId: string) =>
  fixtureValue(t.players.find((p) => p.id === playerId))
    .skills.filter((s) => s.type === SkillType.LONER)
    .map((s) => s.parameter);

describe("a league team short of players", () => {
  it("takes the field with Journeymen at no cost, then hires one for good", () => {
    const home = team("home", 5, 120_000);
    const game = kickOff(home);
    const inMatch = game.ctx.team1;
    const [first, second] = journeymen(inMatch);
    expect(journeymen(inMatch)).toHaveLength(2);

    expect(inMatch.treasury).toBe(120_000);
    expect(loner(inMatch, fixtureValue(first).id)).toEqual(["5+"]);

    fixtureValue(first).spp = 3;
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: true,
      playedIds: new Set([fixtureValue(first).id, fixtureValue(second).id]),
    });
    expect(offers(inMatch).map((entry) => entry.playerId)).toEqual([
      fixtureValue(first).id,
      fixtureValue(second).id,
    ]);
    expect(hasBlockingPendingDevelopment(inMatch)).toBe(true);

    const stored = reload(inMatch);
    expect(journeymen(stored)).toHaveLength(2);
    expect(draftListPlayers(stored)).toHaveLength(5);
    expect(calculateTeamValue(stored)).toBe(calculateTeamValue(reload(home)));

    expect(
      hireJourneyman(stored, offerFor(stored, fixtureValue(first).id))
    ).toBe(50_000);
    expect(stored.treasury).toBe(70_000);
    const hired = fixtureValue(
      stored.players.find((p) => p.id === fixtureValue(first).id)
    );
    expect(hired.playerKind).toBe("roster");
    expect(hired.spp).toBe(3);
    expect(loner(stored, fixtureValue(first).id)).toEqual([]);

    releaseJourneyman(stored, offerFor(stored, fixtureValue(second).id));
    expect(stored.players.some((p) => p.id === fixtureValue(second).id)).toBe(
      false
    );
    expect(offers(stored)).toEqual([]);

    const next = reload(stored);
    expect(draftListPlayers(next)).toHaveLength(6);
    expect(next.players.find((p) => p.id === fixtureValue(first).id)?.spp).toBe(
      3
    );
    expect(journeymen(next)).toEqual([]);
  });

  it("pays the Value Increase of a Journeyman who gained an advancement", () => {
    const inMatch = kickOff(team("home", 6, 200_000)).ctx.team1;
    const [journeyman] = journeymen(inMatch);
    fixtureValue(journeyman).teamValue = 20_000;
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: true,
      playedIds: new Set([fixtureValue(journeyman).id]),
    });
    expect(
      hireJourneyman(inMatch, offerFor(inMatch, fixtureValue(journeyman).id))
    ).toBe(70_000);
    expect(inMatch.treasury).toBe(130_000);
  });

  it("lets a Journeyman who did not play, or died, leave at once", () => {
    const inMatch = kickOff(team("home", 5)).ctx.team1;
    const [benched, dead] = journeymen(inMatch);
    fixtureValue(dead).injuries.push(InjuryType.DEAD);
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: true,
      playedIds: new Set([fixtureValue(dead).id]),
    });
    expect(offers(inMatch)).toEqual([]);
    expect(inMatch.players.some((p) => p.id === fixtureValue(benched).id)).toBe(
      false
    );
    expect(journeymen(inMatch)).toEqual([]);
  });

  it("refuses the hire without the gold or without room under 11", () => {
    const poor = kickOff(team("home", 6, 40_000)).ctx.team1;
    const [journeyman] = journeymen(poor);
    recordPendingDevelopment(poor, "m1", undefined, {
      leagueFixture: true,
      playedIds: new Set([fixtureValue(journeyman).id]),
    });
    const offer = offerFor(poor, fixtureValue(journeyman).id);
    expect(journeymanHireRefusal(poor, offer)).toBe(
      "Not enough gold in the treasury."
    );
    expect(() => hireJourneyman(poor, offer)).toThrow(/Not enough gold/);
    expect(poor.treasury).toBe(40_000);
    expect(offers(poor)).toHaveLength(1);

    const lineman = getRosterByRosterName(RosterName.HUMAN).playerTemplates[0];
    for (let number = 20; draftListPlayers(poor).length < 11; number++)
      poor.players.push(createPlayer(fixtureValue(lineman), poor.id, number));
    poor.treasury = 500_000;
    expect(journeymanHireRefusal(poor, offer)).toBe(
      "A Sevens team may have at most 11 permanently hired players."
    );
  });
});

describe("Journeyman identity and roster slot", () => {
  it("never gives a new Journeyman the id of a hired one who changed number", () => {
    const home = team("home", 5, 200_000);

    const hiredBefore = home.players[0];
    fixtureValue(hiredBefore).id = `${home.id}-journeyman-6`;
    fixtureValue(hiredBefore).spp = 6;
    const inMatch = kickOff(home).ctx.team1;
    const ids = inMatch.players.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    const newcomer = fixtureValue(
      journeymen(inMatch).find((p) => p.number === 6)
    );
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: true,
      playedIds: new Set([newcomer.id]),
    });
    releaseJourneyman(inMatch, offerFor(inMatch, newcomer.id));
    expect(inMatch.players.find((p) => p.number === 1)?.spp).toBe(6);
  });

  it("moves a hired Journeyman wearing a number above 11 into a free slot", () => {
    const inMatch = kickOff(team("home", 6, 200_000)).ctx.team1;
    const [journeyman] = journeymen(inMatch);
    fixtureValue(journeyman).number = 12;
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: true,
      playedIds: new Set([fixtureValue(journeyman).id]),
    });
    hireJourneyman(inMatch, offerFor(inMatch, fixtureValue(journeyman).id));
    expect(fixtureValue(journeyman).number).toBe(7);
  });
});

describe("outside a league fixture", () => {
  it("a friendly or tournament game takes on no Journeymen and offers none", () => {
    const home = team("home", 5, 120_000);
    const inMatch = kickOff(home, false).ctx.team1;
    expect(journeymen(inMatch)).toEqual([]);
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: false,
      playedIds: new Set(inMatch.players.map((p) => p.id)),
    });
    expect(offers(inMatch)).toEqual([]);
  });

  it("lets a Journeyman go without an offer after a game that is not a league fixture", () => {
    const inMatch = kickOff(team("home", 6)).ctx.team1;
    const [journeyman] = journeymen(inMatch);
    recordPendingDevelopment(inMatch, "m1", undefined, {
      leagueFixture: false,
      playedIds: new Set([fixtureValue(journeyman).id]),
    });
    expect(offers(inMatch)).toEqual([]);
    expect(journeymen(inMatch)).toEqual([]);
  });
});
