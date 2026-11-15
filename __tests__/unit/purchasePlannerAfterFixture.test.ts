/**
 * What a team with no human coach releases and buys after a fixture, so a
 * fit player takes the slot of an unfit or unpaid Journeyman
 * (openspec/specs/league-treasury, purchasePlanner.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  manageComputerTeam,
  manageComputerTeams,
} from "../../src/competition/computerTeams";
import { CompetitionDoc } from "../../src/competition/types";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { getTeamById, saveTeams } from "../../src/game/managers/TeamManager";
import {
  PlannedPurchase,
  applyPurchase,
  fitPlayers,
  journeymanOffers,
  planPurchases,
} from "../../src/game/rules/purchasePlanner";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { draftListPlayers, hirePlayer } from "../../src/game/rules/teamPricing";
import {
  journeymanHireRefusal,
  releaseJourneyman,
} from "../../src/game/rules/journeymen";
import { RNGService } from "../../src/services/rng/RNGService";
import { InjuryType } from "../../src/types/Player";
import { RosterName, Team } from "../../src/types/Team";
import {
  leagueTeam,
  offerJourneyman,
  spent,
  applyAll,
  snotlingsAtTheLimit,
} from "./purchasePlannerTeams";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

beforeEach(() => localStorage.clear());

/**
 * A waiting Journeyman who played: unfit when due to Miss Next Game, and
 * dearer than the Hiring Fee by `valueIncrease`.
 */
function waitingJourneyman(
  team: Team,
  number: number,
  {
    fit = true,
    valueIncrease = 0,
  }: { fit?: boolean; valueIncrease?: number } = {}
): string {
  const offerId = offerJourneyman(team, number);
  const player = team.players.find(
    (candidate) => candidate.id === `${team.id}-journeyman-${number}`
  )!;
  if (!fit) player.injuries = [InjuryType.MISS_NEXT_GAME];
  player.teamValue = valueIncrease;
  return offerId;
}

/** A team of `listed` hired players, `missing` of them due to miss the next game. */
function shortTeam(
  roster: RosterName,
  listed: number,
  missing: number,
  treasury: number
): Team {
  const team = leagueTeam(roster, { players: listed, treasury });
  for (const player of team.players.slice(listed - missing))
    player.injuries = [InjuryType.MISS_NEXT_GAME];
  return team;
}

/** The short team, or null when it breaks its roster or the Insignificant limit. */
function legalShortTeam(
  roster: RosterName,
  listed: number,
  missing: number,
  treasury: number
): Team | null {
  const team = shortTeam(roster, listed, missing, treasury);
  const legal =
    team.players.length === listed &&
    validateRosterLegality(team, getRosterByRosterName(roster)).length === 0 &&
    !validateInsignificant(team.players);
  return legal ? team : null;
}

/** Every Journeyman the plan lets go is followed by the player who replaces them. */
function everyReleaseReplaced(plan: PlannedPurchase[]): boolean {
  return plan.every((item, index) => {
    if (item.kind !== "release-journeyman") return true;
    const next = plan
      .slice(index + 1)
      .find((step) => step.kind !== "release-journeyman");
    return next?.kind === "player" && next.reason === "minimum";
  });
}

/**
 * Independent check: could this team still get a fit player now, by hiring
 * a fit waiting Journeyman, or by letting any set of waiting Journeymen go
 * and hiring any roster player through the coach's own `hirePlayer`?
 */
function fitOptionExists(team: Team): boolean {
  const offers = journeymanOffers(team);
  const fitOffer = offers.some((offer) => {
    const player = team.players.find((p) => p.id === offer.playerId);
    return (
      !!player &&
      !player.injuries.includes(InjuryType.MISS_NEXT_GAME) &&
      journeymanHireRefusal(team, offer) === undefined
    );
  });
  if (fitOffer) return true;
  const templates = getRosterByRosterName(team.rosterName).playerTemplates;
  for (let mask = 0; mask < 1 << offers.length; mask++) {
    const trial = structuredClone(team);
    offers.forEach((offer, index) => {
      if (!(mask & (1 << index))) return;
      const own = journeymanOffers(trial).find(
        (entry) => entry.id === offer.id
      )!;
      releaseJourneyman(trial, own);
    });
    for (const template of templates)
      if (hirePlayer(structuredClone(trial), template).amount != null)
        return true;
  }
  return false;
}

/**
 * Apply the plan to a copy of the team. No unfit Journeyman is bought, and
 * the team stops short of seven fit players, only when no fit player could
 * be had; the plan spends what it says and stays within the list limits.
 */
function expectFitPlayersFirst(
  team: Team,
  plan: PlannedPurchase[],
  treasury: number,
  label: string
): void {
  const replay = structuredClone(team);
  for (const item of plan) {
    if (item.kind === "journeyman") {
      const player = replay.players.find((p) => p.id === item.playerId)!;
      if (
        player.injuries.includes(InjuryType.MISS_NEXT_GAME) &&
        fitPlayers(replay).length < 7
      )
        expect(fitOptionExists(replay), label).toBe(false);
    }
    applyPurchase(replay, item);
  }
  expect(replay.treasury, label).toBe(treasury - spent(plan));
  expect(replay.treasury, label).toBeGreaterThanOrEqual(0);
  expect(validateInsignificant(draftListPlayers(replay)), label).toBeNull();
  expect(draftListPlayers(replay).length, label).toBeLessThanOrEqual(11);
  // Seven reached whenever a fit player could still be had
  if (fitPlayers(replay).length < 7)
    expect(fitOptionExists(replay), label).toBe(false);
}

describe("making room for a fit player", () => {
  it("lets an unfit Journeyman go when a fit player can take the slot", () => {
    // Six fit of 10 hired, a payable unfit Journeyman holding the 11th
    // slot: the plan used to keep him and spend the gold on him in step 2
    const team = shortTeam(RosterName.HUMAN, 10, 4, 50_000);
    const offerId = waitingJourneyman(team, 11, { fit: false });
    const plan = planPurchases(team);
    expect(plan).toEqual([
      {
        kind: "release-journeyman",
        offerId,
        playerId: `${team.id}-journeyman-11`,
        playerName: "Journeyman #11",
        price: 0,
        reason: "minimum",
      },
      {
        kind: "player",
        positionName: "Halfling Hopeful",
        price: 30_000,
        reason: "minimum",
      },
    ]);
    applyAll(team, plan);
    expect(fitPlayers(team)).toHaveLength(7);
    expect(team.treasury).toBe(20_000);
  });

  it("does the swap with exactly the replacement's price", () => {
    const team = shortTeam(RosterName.HUMAN, 10, 4, 30_000);
    waitingJourneyman(team, 11, { fit: false });
    const plan = planPurchases(team);
    expect(plan.map((item) => item.kind)).toEqual([
      "release-journeyman",
      "player",
    ]);
    applyAll(team, plan);
    expect(fitPlayers(team)).toHaveLength(7);
    expect(team.treasury).toBe(0);
  });

  it("lets nobody go when no replacement can be paid for", () => {
    // 25,000 gp: neither the 50,000 gp Journeyman nor a 30,000 gp Halfling
    const team = shortTeam(RosterName.HUMAN, 10, 4, 25_000);
    waitingJourneyman(team, 11, { fit: false });
    expect(planPurchases(team)).toEqual([]);
    const fit = structuredClone(team);
    fit.players.find((p) => p.playerKind === "journeyman")!.injuries = [];
    // A fit Journeyman the team cannot pay for is not let go for nothing either
    expect(planPurchases(fit)).toEqual([]);
  });

  it("lets a Journeyman it can never hire go before one it could hire later", () => {
    // 9 hired, 6 fit; an unfit 50,000 gp Journeyman and a fit one worth
    // 110,000 gp (too dear) hold the last two slots; 100,000 gp
    const team = shortTeam(RosterName.HUMAN, 9, 3, 100_000);
    const unfitId = waitingJourneyman(team, 10, { fit: false });
    const dearId = waitingJourneyman(team, 11, { valueIncrease: 60_000 });
    const plan = planPurchases(team);
    expect(
      plan.map((item) => [
        item.kind,
        "offerId" in item ? item.offerId : item.reason,
      ])
    ).toEqual([
      ["release-journeyman", dearId],
      ["player", "minimum"],
      // Seven can play, so the payable Journeyman is still hired in step 2
      ["journeyman", unfitId],
    ]);
    applyAll(team, plan);
    expect(fitPlayers(team)).toHaveLength(7);
  });

  it("lets two go when one freed slot is not enough", () => {
    // 9 hired, 6 fit, and three payable unfit Journeymen numbered 10 to 12:
    // 12 players hold slots, so one must leave for each slot short
    const team = shortTeam(RosterName.HUMAN, 9, 3, 60_000);
    const first = waitingJourneyman(team, 10, { fit: false });
    const second = waitingJourneyman(team, 11, { fit: false });
    waitingJourneyman(team, 12, { fit: false });
    const plan = planPurchases(team);
    expect(
      plan.map((item) => [
        item.kind,
        "offerId" in item ? item.offerId : item.reason,
      ])
    ).toEqual([
      ["release-journeyman", first],
      ["release-journeyman", second],
      ["player", "minimum"],
    ]);
    applyAll(team, plan);
    expect(fitPlayers(team)).toHaveLength(7);
    expect(team.treasury).toBe(30_000);
  });

  it("never lets a Journeyman go when the Insignificant limit blocks every replacement", () => {
    const team = snotlingsAtTheLimit();
    for (const player of team.players.slice(0, 2))
      player.injuries = [InjuryType.MISS_NEXT_GAME];
    waitingJourneyman(team, 9);
    waitingJourneyman(team, 10);
    waitingJourneyman(team, 11);
    const plan = planPurchases(team);
    expect(everyReleaseReplaced(plan)).toBe(true);
    applyAll(team, plan);
    expect(validateInsignificant(draftListPlayers(team))).toBeNull();
  });

  it("never buys an unfit Journeyman while a fit player could be had", () => {
    const rosters = [
      RosterName.HUMAN,
      RosterName.ORC,
      RosterName.SKAVEN,
      RosterName.SNOTLING,
      RosterName.DWARF,
    ];
    const waiting: { fit: boolean; valueIncrease: number }[][] = [
      [],
      [{ fit: false, valueIncrease: 0 }],
      [{ fit: true, valueIncrease: 30_000 }],
      [
        { fit: false, valueIncrease: 0 },
        { fit: false, valueIncrease: 0 },
      ],
      [
        { fit: false, valueIncrease: 0 },
        { fit: true, valueIncrease: 0 },
      ],
      [
        { fit: true, valueIncrease: 30_000 },
        { fit: false, valueIncrease: 0 },
      ],
      [
        { fit: false, valueIncrease: 0 },
        { fit: false, valueIncrease: 0 },
        { fit: false, valueIncrease: 0 },
      ],
    ];
    const cases = rosters.flatMap((roster) =>
      [8, 9, 10].flatMap((listed) =>
        [1, 3].flatMap((missing) =>
          waiting.flatMap((offers) =>
            [25_000, 30_000, 60_000, 100_000].map((treasury) => ({
              roster,
              listed,
              missing,
              offers,
              treasury,
            }))
          )
        )
      )
    );
    let checked = 0;
    for (const { roster, listed, missing, offers, treasury } of cases) {
      const team = legalShortTeam(roster, listed, missing, treasury);
      if (!team) continue;
      offers.forEach((offer, index) =>
        waitingJourneyman(team, listed + 1 + index, offer)
      );
      const label = `${roster} ${listed}/${missing} ${JSON.stringify(offers)} ${treasury}`;
      const plan = planPurchases(team);
      expect(planPurchases(structuredClone(team)), label).toEqual(plan);
      expect(everyReleaseReplaced(plan), label).toBe(true);
      expectFitPlayersFirst(team, plan, treasury, label);
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe("managing a team after a fixture", () => {
  it("lets go a Journeyman it cannot pay for when their slot is needed", () => {
    // 10 hired players, 6 of them fit, a waiting 50,000 gp Journeyman holding
    // the 11th slot, and 30,000 gp: only a Halfling Hopeful is affordable
    const team = leagueTeam(RosterName.HUMAN, {
      players: 10,
      treasury: 30_000,
    });
    for (const player of team.players.slice(6))
      player.injuries = [InjuryType.MISS_NEXT_GAME];
    const offerId = offerJourneyman(team, 11);
    expect(fitPlayers(team)).toHaveLength(6);
    const plan = planPurchases(team);
    expect(plan).toEqual([
      {
        kind: "release-journeyman",
        offerId,
        playerId: `${team.id}-journeyman-11`,
        playerName: "Journeyman #11",
        price: 0,
        reason: "minimum",
      },
      {
        kind: "player",
        positionName: "Halfling Hopeful",
        price: 30_000,
        reason: "minimum",
      },
    ]);
    const report = manageComputerTeam(team, new RNGService(3));
    expect(fitPlayers(team)).toHaveLength(7);
    expect(team.treasury).toBe(0);
    expect(team.pendingDevelopment).toEqual([]);
    expect(report.setbacks).toEqual([]);
  });

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

  it("answers a Journeyman offer even when it spends nothing", () => {
    const team = leagueTeam(RosterName.HUMAN, {
      players: 6,
      treasury: 500_000,
    });
    delete team.firstMatchPlayedAt;
    offerJourneyman(team, 7);
    manageComputerTeam(team, new RNGService(3));
    expect(team.pendingDevelopment).toEqual([]);
    expect(team.treasury).toBe(500_000);
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
