/**
 * What a team with no human coach buys from its Treasury between league
 * fixtures (openspec/specs/league-treasury, purchasePlanner.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

import {
  createComputerTeam,
  manageComputerTeam,
  manageComputerTeams,
} from "../../src/competition/computerTeams";
import { CompetitionDoc } from "../../src/competition/types";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { getTeamById, saveTeams } from "../../src/game/managers/TeamManager";
import { readyForLeagueGame } from "../../src/game/rules/leagueRoster";
import {
  PlannedPurchase,
  applyPurchase,
  draftReserve,
  fitPlayers,
  planPurchases,
} from "../../src/game/rules/purchasePlanner";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { draftListPlayers } from "../../src/game/rules/teamPricing";
import { RNGService } from "../../src/services/rng/RNGService";
import {
  InjuryType,
  PlayerStatus,
  PositionKeyWord,
  createPlayer,
} from "../../src/types/Player";
import { RosterName, Team } from "../../src/types/Team";

/** A computer league team after its first fixture. */
function leagueTeam(
  roster: RosterName,
  {
    players = 7,
    treasury = 0,
    rerolls,
  }: { players?: number; treasury?: number; rerolls?: number } = {}
): Team {
  const team = createComputerTeam(
    roster,
    `${roster} XI`,
    0x335577,
    "advanced-league"
  );
  team.firstMatchPlayedAt = 1;
  team.players = team.players.slice(0, players);
  // More than the ready-made 7: Linemen in the next numbers
  const lineman = getRosterByRosterName(roster).playerTemplates.find(
    (template) => template.keywords.includes(PositionKeyWord.LINEMAN)
  );
  for (
    let number = team.players.length + 1;
    lineman && number <= players;
    number++
  )
    team.players.push(createPlayer(lineman, team.id, number));
  team.treasury = treasury;
  if (rerolls !== undefined) team.rerolls = rerolls;
  return team;
}

/** A Journeyman who played and waits on a hiring decision. */
function offerJourneyman(team: Team, number: number, spp = 0): string {
  const lineman = getRosterByRosterName(team.rosterName).playerTemplates[0];
  const journeyman = createPlayer(
    lineman,
    team.id,
    number,
    `Journeyman #${number}`
  );
  journeyman.id = `${team.id}-journeyman-${number}`;
  journeyman.playerKind = "journeyman";
  journeyman.spp = spp;
  team.players.push(journeyman);
  const offerId = `journeyman-m-${number}`;
  (team.pendingDevelopment ??= []).push({
    id: offerId,
    kind: "journeyman-offer",
    playerId: journeyman.id,
    matchId: "m",
    createdAt: 1,
  });
  return offerId;
}

const reasons = (plan: PlannedPurchase[]) => plan.map((item) => item.reason);
const spent = (plan: PlannedPurchase[]) =>
  plan.reduce((sum, item) => sum + item.price, 0);

/** Apply a plan the way the computer does, through the coach's code. */
function applyAll(team: Team, plan: PlannedPurchase[]): void {
  for (const item of plan) applyPurchase(team, item);
}

beforeEach(() => localStorage.clear());

describe("the purchase plan of a team with no human coach", () => {
  it("first brings a short team up to 7 fit players with the cheapest players", () => {
    // 4 on the list and one of them misses the next game: 3 fit
    const team = leagueTeam(RosterName.ORC, { players: 4, treasury: 160_000 });
    team.players[0].injuries = [InjuryType.MISS_NEXT_GAME];
    const plan = planPurchases(team);
    // Goblin Linemen are the cheapest Orcs, at 40,000 gp each
    expect(plan.slice(0, 4)).toEqual(
      Array(4).fill({
        kind: "player",
        positionName: "Goblin Lineman",
        price: 40_000,
        reason: "minimum",
      })
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
    // Two at 50,000 each; the third cannot be paid for
    expect(reasons(plan)).toEqual(["journeyman", "journeyman"]);
    expect(team.treasury).toBe(120_000);
  });

  it("buys a team re-roll when it has none, before filling the roster", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 160_000,
      rerolls: 0,
    });
    const plan = planPurchases(team);
    expect(plan[0]).toEqual({
      kind: "staff",
      item: "reroll",
      price: 100_000,
      reason: "reroll",
    });
    // Then the cheapest Humans: Halfling Hopefuls at 30,000 gp
    expect(plan.slice(1)).toEqual(
      Array(2).fill({
        kind: "player",
        positionName: "Halfling Hopeful",
        price: 30_000,
        reason: "roster",
      })
    );
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
    // Halfling Hopefuls are allowed 3; the fourth is a Lineman
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
    expect(team.treasury).toBeLessThan(100_000);
    expect(team.treasury).toBeGreaterThanOrEqual(0);
  });

  it("keeps back what keeping a drafted Skill Selection player costs", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 7,
      treasury: 200_000,
      rerolls: 0,
    });
    team.advancementMode = "sevens-skill-selection";
    // A player with an added skill a pro team may draft: worth 105,000 gp
    const star = team.players[0];
    star.cost = 85_000;
    star.teamValue = 20_000;
    star.advancements = [
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
    // No 100,000 gp re-roll: it would leave 100,000 gp, under the reserve.
    // Three 30,000 gp Halfling Hopefuls leave 110,000 gp; a Lineman would
    // leave 60,000 gp, too little to keep the star.
    expect(plan.map((item) => item.reason)).toEqual([
      "roster",
      "roster",
      "roster",
    ]);
    expect(200_000 - spent(plan)).toBe(110_000);
    // An Advanced League team has no Drafted Players to pay for
    team.advancementMode = "advanced-league";
    expect(draftReserve(team)).toBe(0);
    expect(spent(planPurchases(team))).toBeGreaterThan(90_000);

    // Nor does a spare Journeyman come out of the reserve
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
    team.players[0].teamValue = 60_000;
    team.players[0].advancements = [
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
      team.players.push(createPlayer(lineman, team.id, number));
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
          // Only a legal team to start from
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
          const label = `${roster} ${players} players ${treasury} gp`;
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

describe("managing a team after a fixture", () => {
  it("lets go the Journeymen it does not hire", () => {
    const team = leagueTeam(RosterName.HUMAN, { players: 11, treasury: 0 });
    team.players = team.players.slice(0, 7);
    offerJourneyman(team, 8);
    const report = manageComputerTeam(team, new RNGService(3));
    expect(team.pendingDevelopment).toEqual([]);
    expect(team.players).toHaveLength(7);
    expect(report.done).toContainEqual(
      expect.stringMatching(/Journeyman.*let go/)
    );
  });

  it("never touches a team a person coaches", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 4,
      treasury: 500_000,
    });
    delete team.computerCoached;
    team.coachName = "Pat";
    offerJourneyman(team, 5);
    const before = JSON.stringify(team);
    const report = manageComputerTeam(team, new RNGService(3));
    expect(JSON.stringify(team)).toBe(before);
    expect(report).toEqual({ done: [], setbacks: [], refused: [] });
  });

  it("manages only the computer entrants of a competition", () => {
    const computer = leagueTeam(RosterName.HUMAN, {
      players: 5,
      treasury: 200_000,
    });
    const person = leagueTeam(RosterName.ORC, {
      players: 5,
      treasury: 200_000,
    });
    delete person.computerCoached;
    saveTeams([computer, person]);
    const competition = {
      entrants: [
        { id: "c", teamId: computer.id, computerCoached: true },
        { id: "p", teamId: person.id, ownerUid: "uid-p" },
      ],
    } as unknown as CompetitionDoc;
    const personBefore = JSON.stringify(getTeamById(person.id));
    manageComputerTeams(competition, new RNGService(5));
    expect(fitPlayers(getTeamById(computer.id)!).length).toBeGreaterThanOrEqual(
      7
    );
    expect(JSON.stringify(getTeamById(person.id))).toBe(personBefore);
  });
});
