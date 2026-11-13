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
  journeymanOffers,
  planPurchases,
} from "../../src/game/rules/purchasePlanner";
import { validateRosterLegality } from "../../src/game/rules/rosterLegality";
import { validateInsignificant } from "../../src/game/rules/insignificant";
import { draftListPlayers, hirePlayer } from "../../src/game/rules/teamPricing";
import {
  hireJourneyman,
  journeymanHireRefusal,
  releaseJourneyman,
} from "../../src/game/rules/journeymen";
import { SkillType } from "../../src/types/Skills";
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

/**
 * An active Snotling team whose list holds as many Insignificant Snotling
 * Linemen as other players, 4 and 4, with gold to spare.
 */
function snotlingsAtTheLimit(): Team {
  const team = leagueTeam(RosterName.SNOTLING, {
    players: 0,
    treasury: 300_000,
  });
  const templates = getRosterByRosterName(RosterName.SNOTLING).playerTemplates;
  const insignificant = (template: (typeof templates)[number]) =>
    template.skills.some((skill) => skill.type === SkillType.INSIGNIFICANT);
  const significant = templates.filter((template) => !insignificant(template));
  const snotling = templates.find(insignificant)!;
  const picks = significant.flatMap((template) =>
    Array(template.maxAllowed ?? 1).fill(template)
  );
  team.players = [...picks.slice(0, 4), ...Array(4).fill(snotling)].map(
    (template, index) => createPlayer(template, team.id, index + 1)
  );
  team.rerolls = 6;
  team.apothecary = true;
  team.coaches = 3;
  team.cheerleaders = 3;
  expect(validateInsignificant(team.players)).toBeNull();
  return team;
}

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
    const offer = team.pendingDevelopment!.find(
      (entry) => entry.id === offerId
    )!;
    expect(journeymanHireRefusal(team, offer as never)).toMatch(
      /Insignificant/
    );
    expect(() => hireJourneyman(team, offer as never)).toThrow(/Insignificant/);
    const snotling = getRosterByRosterName(
      RosterName.SNOTLING
    ).playerTemplates.find(
      (template) => template.positionName === "Snotling Lineman"
    )!;
    expect(hirePlayer(team, snotling)).toMatchObject({ amount: null });
    expect(team.treasury).toBe(300_000);
  });
});

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
    let checked = 0;
    for (const roster of rosters)
      for (const listed of [8, 9, 10])
        for (const missing of [1, 3])
          for (const offers of waiting)
            for (const treasury of [25_000, 30_000, 60_000, 100_000]) {
              const team = shortTeam(roster, listed, missing, treasury);
              if (
                team.players.length !== listed ||
                validateRosterLegality(team, getRosterByRosterName(roster))
                  .length > 0 ||
                validateInsignificant(team.players)
              )
                continue;
              offers.forEach((offer, index) =>
                waitingJourneyman(team, listed + 1 + index, offer)
              );
              const label = `${roster} ${listed}/${missing} ${JSON.stringify(offers)} ${treasury}`;
              const plan = planPurchases(team);
              expect(planPurchases(structuredClone(team)), label).toEqual(plan);
              expect(everyReleaseReplaced(plan), label).toBe(true);
              const replay = structuredClone(team);
              for (const item of plan) {
                if (item.kind === "journeyman") {
                  const player = replay.players.find(
                    (p) => p.id === item.playerId
                  )!;
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
              expect(
                validateInsignificant(draftListPlayers(replay)),
                label
              ).toBeNull();
              expect(
                draftListPlayers(replay).length,
                label
              ).toBeLessThanOrEqual(11);
              // Seven reached whenever a fit player could still be had
              if (fitPlayers(replay).length < 7)
                expect(fitOptionExists(replay), label).toBe(false);
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
