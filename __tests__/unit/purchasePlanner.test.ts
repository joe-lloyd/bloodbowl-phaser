import { fixtureValue } from "../../src/testing/fixtureValue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { manageComputerTeam } from "../../src/competition/computerTeams";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { readyForLeagueGame } from "../../src/game/rules/leagueRoster";
import {
  draftReserve,
  fitPlayers,
  planPurchases,
} from "../../src/game/rules/purchasePlanner";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { draftListPlayers, hirePlayer } from "../../src/game/rules/teamPricing";
import {
  hireJourneyman,
  journeymanHireRefusal,
} from "../../src/game/rules/journeymen";
import { RNGService } from "../../src/services/rng/RNGService";
import { InjuryType, PlayerStatus, createPlayer } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import {
  leagueTeam,
  offerJourneyman,
  reasons,
  spent,
  applyAll,
  snotlingsAtTheLimit,
} from "./purchasePlannerTeams";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
});

describe("the purchase plan of a team with no human coach", () => {
  it("first brings a short team up to 7 fit players with the cheapest players", () => {
    const team = leagueTeam(RosterName.ORC, { players: 4, treasury: 160_000 });
    fixtureValue(team.players[0]).injuries = [InjuryType.MISS_NEXT_GAME];
    const plan = planPurchases(team);

    expect(plan.slice(0, 4)).toEqual(
      Array.from({ length: 4 }, () => ({
        kind: "player",
        positionName: "Goblin Lineman",
        price: 40_000,
        reason: "minimum",
      }))
    );
    applyAll(team, plan);
    expect(fitPlayers(team)).toHaveLength(7);
    expect(team.treasury).toBe(0);
  });

  it("hires a Journeyman who played before a new player when short", () => {
    const team = leagueTeam(RosterName.HUMAN, { players: 6, treasury: 50_000 });
    const offerId = offerJourneyman(team, 7, 2);
    const plan = planPurchases(team);
    expect(plan).toEqual([
      {
        kind: "journeyman",
        offerId,
        playerId: `${team.id}-journeyman-7`,
        playerName: "Journeyman #7",
        price: 50_000,
        reason: "minimum",
      },
    ]);
  });

  it("then hires the other Journeymen who played while there is room and gold", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 120_000,
      rerolls: 1,
    });
    offerJourneyman(team, 8);
    offerJourneyman(team, 9);
    offerJourneyman(team, 10);
    const plan = planPurchases(team);

    expect(reasons(plan)).toEqual(["journeyman", "journeyman"]);
    expect(team.treasury).toBe(120_000);
  });

  it("fills the roster toward 11 with the cheapest players the roster allows", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 230_000,
      rerolls: 2,
    });
    const plan = planPurchases(team);
    applyAll(team, plan);
    expect(draftListPlayers(team)).toHaveLength(11);
    expect(reasons(plan).every((reason) => reason === "roster")).toBe(true);

    expect(
      plan.map((item) => item.kind === "player" && item.positionName)
    ).toEqual([
      "Halfling Hopeful",
      "Halfling Hopeful",
      "Halfling Hopeful",
      "Human Lineman",
    ]);
    expect(team.treasury).toBe(230_000 - 3 * 30_000 - 50_000);
  });

  it("spends 100,000 gp or more on staff once the roster is full", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 700_000,
      rerolls: 2,
    });
    const plan = planPurchases(team);
    applyAll(team, plan);
    const spendDown = plan.filter((item) => item.reason === "spend-down");
    expect(spendDown[0]).toMatchObject({ item: "apothecary", price: 80_000 });
    expect(spendDown.slice(1).every((item) => item.kind === "staff")).toBe(
      true
    );
    expect(team.apothecary).toBe(true);
    expect([team.coaches, team.cheerleaders, team.rerolls]).toEqual([3, 3, 2]);
    expect(team.treasury).toBe(360_000);
  });

  it("keeps back what keeping a drafted Skill Selection player costs", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 200_000,
      rerolls: 0,
    });
    team.advancementMode = "sevens-skill-selection";

    const star = team.players[0];
    fixtureValue(star).cost = 85_000;
    fixtureValue(star).teamValue = 20_000;
    fixtureValue(star).advancements = [
      {
        id: "adv-1",
        type: "primary-skill",
        name: "Block",
        sppCost: 0,
        valueIncrease: 20_000,
        source: "sevens-skill-selection",
      },
    ];
    expect(draftReserve(team)).toBe(105_000);
    const plan = planPurchases(team);

    expect(plan.map((item) => item.reason)).toEqual([
      "roster",
      "roster",
      "roster",
    ]);
    expect(200_000 - spent(plan)).toBe(110_000);

    team.advancementMode = "advanced-league";
    expect(draftReserve(team)).toBe(0);
    expect(spent(planPurchases(team))).toBeGreaterThan(90_000);

    team.advancementMode = "sevens-skill-selection";
    team.treasury = 140_000;
    offerJourneyman(team, 8);
    expect(planPurchases(team)).toEqual([
      {
        kind: "player",
        positionName: "Halfling Hopeful",
        price: 30_000,
        reason: "roster",
      },
    ]);
  });

  it("still brings a Skill Selection team up to 7 before keeping anything back", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 5,
      treasury: 110_000,
    });
    team.advancementMode = "sevens-skill-selection";
    fixtureValue(team.players[0]).teamValue = 60_000;
    fixtureValue(team.players[0]).advancements = [
      {
        id: "adv-1",
        type: "primary-skill",
        name: "Block",
        sppCost: 0,
        valueIncrease: 60_000,
      },
    ];
    const plan = planPurchases(team);
    applyAll(team, plan);
    expect(fitPlayers(team)).toHaveLength(7);
    expect(reasons(plan)).toEqual(["minimum", "minimum"]);
  });

  it("keeps its gold when nothing worth buying is left", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 400_000,
      rerolls: 6,
    });
    const lineman = getRosterByRosterName(RosterName.HUMAN).playerTemplates[0];
    for (let number = 8; number <= 11; number++)
      team.players.push(createPlayer(fixtureValue(lineman), team.id, number));
    team.apothecary = true;
    team.coaches = 3;
    team.cheerleaders = 3;
    expect(planPurchases(team)).toEqual([]);
  });

  it("buys nothing with no money, and still takes the field with Journeymen", () => {
    const team = leagueTeam(RosterName.HUMAN, { players: 5, treasury: 0 });
    expect(planPurchases(team)).toEqual([]);
    const before = JSON.stringify(team);
    manageComputerTeam(team, new RNGService(1));
    expect(team.players).toHaveLength(5);
    expect(team.treasury).toBe(0);
    expect(team.players).toEqual(JSON.parse(before).players);
    readyForLeagueGame(team, { leagueFixture: true });
    expect(
      team.players.filter((player) => player.status === PlayerStatus.RESERVE)
    ).toHaveLength(7);
    expect(
      team.players.filter((p) => p.playerKind === "journeyman")
    ).toHaveLength(2);
    expect(team.treasury).toBe(0);
  });

  it("gives the same plan for the same team and leaves the team as it was", () => {
    const team = leagueTeam(RosterName.SKAVEN, {
      players: 5,
      treasury: 455_000,
      rerolls: 0,
    });
    offerJourneyman(team, 6, 3);
    const before = JSON.stringify(team);
    const plan = planPurchases(team);
    expect(JSON.stringify(team)).toBe(before);
    expect(planPurchases(structuredClone(team))).toEqual(plan);
    expect(planPurchases(team)).toEqual(plan);
    expect(spent(plan)).toBeLessThanOrEqual(455_000);
  });

  it("never overspends or breaks a roster limit, for any roster", () => {
    let checked = 0;
    for (const roster of Object.values(RosterName)) {
      for (const players of [3, 5, 7, 9, 11]) {
        for (const treasury of [
          0, 35_000, 95_000, 180_000, 420_000, 1_000_000,
        ]) {
          const team = leagueTeam(roster, {
            players,
            treasury,
            rerolls: players % 2,
          });

          if (
            team.players.length !== players ||
            validateRosterLegality(team, getRosterByRosterName(roster)).length >
              0 ||
            validateInsignificant(team.players)
          )
            continue;
          checked++;
          const plan = planPurchases(team);
          expect(spent(plan)).toBeLessThanOrEqual(treasury);
          applyAll(team, plan);
          const label = `${roster} ${String(players)} players ${String(treasury)} gp`;
          expect(team.treasury, label).toBeGreaterThanOrEqual(0);
          expect(team.treasury, label).toBe(treasury - spent(plan));
          expect(draftListPlayers(team).length, label).toBeLessThanOrEqual(11);
          expect(
            validateRosterLegality(team, getRosterByRosterName(roster)),
            label
          ).toEqual([]);
          expect(validateInsignificant(team.players), label).toBeNull();
          const numbers = team.players.map((player) => player.number);
          expect(new Set(numbers).size, label).toBe(numbers.length);
          expect(Math.max(...numbers), label).toBeLessThanOrEqual(11);
          expect(new Set(team.players.map((p) => p.id)).size, label).toBe(
            team.players.length
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(Object.values(RosterName).length * 20);
  });
});

describe("the Insignificant limit between fixtures", () => {
  it("stops the planner hiring an Insignificant Journeyman past it", () => {
    const team = snotlingsAtTheLimit();
    offerJourneyman(team, 9);
    const plan = planPurchases(team);
    expect(plan.filter((item) => item.kind === "journeyman")).toEqual([]);
    applyAll(team, plan);
    expect(validateInsignificant(draftListPlayers(team))).toBeNull();
  });

  it("stops a coach hiring one past it too, Journeyman or new player", () => {
    const team = snotlingsAtTheLimit();
    const offerId = offerJourneyman(team, 9);
    const offer = fixtureValue(fixtureValue(team.pendingDevelopment).find(
      (entry) => entry.id === offerId
    ));
    expect(journeymanHireRefusal(team, offer as never)).toMatch(
      /Insignificant/
    );
    expect(() => hireJourneyman(team, offer as never)).toThrow(/Insignificant/);
    const snotling = fixtureValue(getRosterByRosterName(
      RosterName.SNOTLING
    ).playerTemplates.find(
      (template) => template.positionName === "Snotling Lineman"
    ));
    expect(hirePlayer(team, snotling)).toMatchObject({ amount: null });
    expect(team.treasury).toBe(300_000);
  });
});
