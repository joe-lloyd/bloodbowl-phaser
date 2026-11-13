/**
 * League winnings (openspec/specs/league-winnings): Fan Factor, Fan
 * Attendance and the Treasury payment after a recorded league fixture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateRoundRobin,
  generateSingleElimination,
} from "../../src/competition/logic";
import { saveCompetition } from "../../src/competition/repository";
import {
  keepRecordedResult,
  recordCompetitionFixture,
} from "../../src/competition/resultRecording";
import {
  CompetitionContext,
  CompetitionEntrant,
  LeagueDoc,
  TournamentDoc,
} from "../../src/competition/types";
import {
  getTeamById,
  loadTeams,
  saveTeam,
  saveTeams,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import {
  fixtureWinnings,
  rollD3,
  winningsFor,
} from "../../src/game/rules/winnings";
import { GameService } from "../../src/services/GameService";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { Team, TeamAdvancementMode } from "../../src/types/Team";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

/** Dice that come up in the given order: the game's dice source, fixed. */
function fixedDice(...rolls: number[]) {
  const queue = [...rolls];
  return {
    rollDie: vi.fn((sides: number) => {
      const roll = queue.shift();
      if (roll === undefined) throw new Error("No fixed roll left.");
      if (roll < 1 || roll > sides) throw new Error(`Bad d${sides}: ${roll}`);
      return roll;
    }),
    rollMultipleDice: vi.fn(),
    getSeed: vi.fn(() => 1),
  };
}

function libraryTeam(
  id: string,
  dedicatedFans: number,
  treasury: number,
  advancementMode: TeamAdvancementMode = "sevens-skill-selection"
): Team {
  const team = new TeamBuilder()
    .withId(id)
    .withName(id.toUpperCase())
    .withPlayers(7)
    .withTreasury(treasury)
    .build();
  team.advancementMode = advancementMode;
  team.dedicatedFans = dedicatedFans;
  return team;
}

function entrantsFor(teams: Team[]): CompetitionEntrant[] {
  return teams.map((team, index) => ({
    id: `local:${team.id}`,
    teamId: team.id,
    ownerUid: null,
    name: team.name,
    rosterName: team.rosterName,
    seed: index + 1,
  }));
}

async function league(id: string, teams: Team[]): Promise<CompetitionContext> {
  saveTeams(teams);
  const entrants = entrantsFor(teams);
  const fixtures = generateRoundRobin(entrants);
  const doc: LeagueDoc = {
    id,
    type: "league",
    name: id,
    organizerUid: null,
    participantUids: [],
    status: "active",
    entrants,
    fixtures,
    standings: computeStandings(entrants, fixtures),
    points: { win: 3, draw: 1, loss: 0 },
    createdAt: 1,
    updatedAt: 1,
  };
  await saveCompetition(doc);
  // The first fixture has team 0 at home
  const first = fixtures.find(
    (fixture) => fixture.homeEntrantId === entrants[0].id
  )!;
  return {
    competitionType: "league",
    competitionId: id,
    fixtureId: first.id,
  };
}

const treasuryOf = (id: string) =>
  loadTeams().find((team) => team.id === id)?.treasury;

beforeEach(() => {
  localStorage.clear();
  setTeamRepository(null);
});

describe("the winnings formula", () => {
  it("pays half the Fan Attendance plus the team's touchdowns, times 10,000", () => {
    expect(winningsFor(8, 2)).toBe(60_000);
    expect(winningsFor(8, 1)).toBe(50_000);
    expect(winningsFor(8, 0)).toBe(40_000);
  });

  it("keeps the half of an odd Fan Attendance: 3.5 pays 35,000", () => {
    expect(winningsFor(7, 0)).toBe(35_000);
    expect(winningsFor(7, 3)).toBe(65_000);
  });

  it("pays winner, loser and draw by the same formula", () => {
    expect(fixtureWinnings({ home: 3, away: 2 }, 0, 0)).toEqual({
      fanFactor: { home: 3, away: 2 },
      home: 25_000,
      away: 25_000,
    });
  });

  it("rolls a D3 as a D6 halved, rounding up", () => {
    const dice = fixedDice(1, 2, 3, 4, 5, 6);
    expect([1, 2, 3, 4, 5, 6].map(() => rollD3(dice))).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
  });
});

describe("league winnings in the Treasury", () => {
  it("pays the worked example from a played game: 60,000 and 50,000", async () => {
    // Team A: 2 Dedicated Fans, rolls a 2. Team B: 1, rolls a 3.
    const home = libraryTeam("team-a", 2, 100_000);
    const away = libraryTeam("team-b", 1, 50_000);
    const context = await league("worked", [home, away]);

    // Full time in the engine rolls The Fans on the game's dice
    const eventBus = new EventBus();
    const dice = fixedDice(4, 6, 1, 6); // D3 2, D3 3, then Dedicated Fans
    const engine = new GameService(
      eventBus,
      structuredClone(home),
      structuredClone(away),
      dice as never,
      {} as never
    );
    const state = engine.getState();
    // Set from the competition context when a league fixture starts
    state.paysWinnings = true;
    state.score[home.id] = 2;
    state.score[away.id] = 1;
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
    expect(state.fanFactors).toEqual({ "team-a": 4, "team-b": 4 });

    const competition = await recordCompetitionFixture(
      context,
      2,
      1,
      { home: engine.getTeam(home.id)!, away: engine.getTeam(away.id)! },
      undefined,
      {
        fanFactors: {
          home: state.fanFactors![home.id],
          away: state.fanFactors![away.id],
        },
      }
    );

    expect(treasuryOf("team-a")).toBe(160_000);
    expect(treasuryOf("team-b")).toBe(100_000);
    const fixture = competition.fixtures.find(
      (f) => f.id === context.fixtureId
    );
    expect(fixture?.result?.winnings).toEqual({
      fanFactor: { home: 4, away: 4 },
      home: 60_000,
      away: 50_000,
    });
  });

  it("pays a result recorded by score only, rolling The Fans on fixed dice", async () => {
    const home = libraryTeam("score-a", 2, 100_000);
    const away = libraryTeam("score-b", 1, 50_000);
    const context = await league("score-only", [home, away]);

    await recordCompetitionFixture(context, 2, 1, undefined, undefined, {
      rng: fixedDice(4, 6), // D3 2 for Team A, D3 3 for Team B
    });

    expect(treasuryOf("score-a")).toBe(160_000);
    expect(treasuryOf("score-b")).toBe(100_000);
  });

  it("pays once when the result is recorded again or the page reloads", async () => {
    const home = libraryTeam("once-a", 2, 100_000);
    const away = libraryTeam("once-b", 1, 50_000);
    const context = await league("once", [home, away]);
    const played = {
      home: structuredClone(home),
      away: structuredClone(away),
    };

    await recordCompetitionFixture(context, 2, 1, played, undefined, {
      fanFactors: { home: 4, away: 4 },
    });
    // The other coach reports, then a reload reports again with new rolls
    await recordCompetitionFixture(context, 2, 1, played, undefined, {
      fanFactors: { home: 6, away: 6 },
    });
    await recordCompetitionFixture(context, 2, 1, undefined, undefined, {
      rng: fixedDice(6, 6),
    });

    expect(treasuryOf("once-a")).toBe(160_000);
    expect(treasuryOf("once-b")).toBe(100_000);
  });

  it("keeps the winnings when the results screen saves its kick-off copy", async () => {
    const home = libraryTeam("keep-a", 2, 100_000);
    const away = libraryTeam("keep-b", 1, 50_000);
    const context = await league("keep", [home, away]);
    const matchCopy = structuredClone(home);

    await recordCompetitionFixture(
      context,
      2,
      1,
      { home: structuredClone(home), away: structuredClone(away) },
      undefined,
      { fanFactors: { home: 4, away: 4 } }
    );
    // MatchResultsScreen: confirm SPP, keep the recorded result, save
    keepRecordedResult(matchCopy);
    saveTeam(matchCopy);

    expect(getTeamById("keep-a")?.treasury).toBe(160_000);
  });

  it("pays a penalty-free set-up concession by the normal formula", async () => {
    const home = libraryTeam("concede-a", 1, 0);
    const away = libraryTeam("concede-b", 1, 0);
    const context = await league("concede", [home, away]);

    // The played score stands: 0-0, nobody's touchdowns are moved
    await recordCompetitionFixture(
      context,
      0,
      0,
      { home: structuredClone(home), away: structuredClone(away) },
      undefined,
      { fanFactors: { home: 2, away: 3 } }
    );

    expect(treasuryOf("concede-a")).toBe(25_000);
    expect(treasuryOf("concede-b")).toBe(25_000);
  });
});

describe("games that pay nothing", () => {
  it("a tournament fixture leaves both Treasuries unchanged", async () => {
    const teams = [
      libraryTeam("cup-a", 2, 100_000),
      libraryTeam("cup-b", 1, 50_000),
    ];
    saveTeams(teams);
    const entrants = entrantsFor(teams);
    const fixtures = generateSingleElimination(entrants);
    const cup: TournamentDoc = {
      id: "cup",
      type: "tournament",
      format: "single-elimination",
      name: "Cup",
      organizerUid: null,
      participantUids: [],
      status: "active",
      entrants,
      fixtures,
      standings: computeStandings(entrants, fixtures),
      createdAt: 1,
      updatedAt: 1,
    };
    await saveCompetition(cup);
    const context: CompetitionContext = {
      competitionType: "tournament",
      competitionId: cup.id,
      fixtureId: fixtures[0].id,
    };

    // Full time of a cup tie between league teams rolls no Fan Factor: the
    // only dice are the Dedicated Fans update (a win on a 2 at 2 fans, a
    // loss on a 1 at 1 fan), exactly as before winnings existed
    const eventBus = new EventBus();
    const dice = fixedDice(2, 1);
    const engine = new GameService(
      eventBus,
      structuredClone(teams[0]),
      structuredClone(teams[1]),
      dice as never,
      {} as never
    );
    const state = engine.getState();
    state.knockout = true;
    state.score[teams[0].id] = 2;
    state.score[teams[1].id] = 1;
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
    expect(state.fanFactors).toBeUndefined();
    expect(dice.rollDie).toHaveBeenCalledTimes(2);
    expect(engine.getTeam(teams[0].id)?.dedicatedFans).toBe(3);
    expect(engine.getTeam(teams[1].id)?.dedicatedFans).toBe(1);

    const updated = await recordCompetitionFixture(
      context,
      2,
      1,
      {
        home: engine.getTeam(teams[0].id)!,
        away: engine.getTeam(teams[1].id)!,
      },
      undefined,
      // A caller passing Fan Factors anyway still pays nothing
      { fanFactors: { home: 4, away: 4 } }
    );
    expect(updated.fixtures[0].result?.winnings).toBeUndefined();
    expect(treasuryOf("cup-a")).toBe(100_000);
    expect(treasuryOf("cup-b")).toBe(50_000);
  });

  it("a tournament fixture reported by score only rolls and pays nothing", async () => {
    const teams = [
      libraryTeam("pool-a", 2, 100_000),
      libraryTeam("pool-b", 1, 50_000),
    ];
    saveTeams(teams);
    const entrants = entrantsFor(teams);
    const fixtures = generateRoundRobin(entrants);
    const pool: TournamentDoc = {
      id: "pool",
      type: "tournament",
      format: "round-robin",
      name: "Pool",
      organizerUid: null,
      participantUids: [],
      status: "active",
      entrants,
      fixtures,
      standings: computeStandings(entrants, fixtures),
      createdAt: 1,
      updatedAt: 1,
    };
    await saveCompetition(pool);
    const dice = fixedDice(); // throws if anything is rolled

    await recordCompetitionFixture(
      {
        competitionType: "tournament",
        competitionId: pool.id,
        fixtureId: fixtures[0].id,
      },
      2,
      1,
      undefined,
      undefined,
      { rng: dice }
    );

    expect(dice.rollDie).not.toHaveBeenCalled();
    expect(treasuryOf("pool-a")).toBe(100_000);
    expect(treasuryOf("pool-b")).toBe(50_000);
  });

  it("a Matched Play team in a league takes no winnings", async () => {
    const home = libraryTeam("mp-a", 0, 100_000, "matched-play");
    const away = libraryTeam("mp-b", 0, 50_000, "matched-play");
    const context = await league("matched", [home, away]);

    await recordCompetitionFixture(context, 2, 1, undefined, undefined, {
      rng: fixedDice(6, 6),
    });

    expect(treasuryOf("mp-a")).toBe(100_000);
    expect(treasuryOf("mp-b")).toBe(50_000);
  });

  it("a game with no league team rolls no Fan Factors and records none", async () => {
    const home = libraryTeam("friendly-a", 0, 100_000, "matched-play");
    const away = libraryTeam("friendly-b", 0, 50_000, "matched-play");
    const eventBus = new EventBus();
    const dice = fixedDice();
    const engine = new GameService(
      eventBus,
      home,
      away,
      dice as never,
      {} as never
    );
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });

    expect(engine.getState().fanFactors).toBeUndefined();
    expect(dice.rollDie).not.toHaveBeenCalled();
  });

  it("a league team's friendly match leaves its stored Treasury unchanged", () => {
    // Quick, computer and online friendly games never record a fixture: the
    // results screen only keeps the stored record and saves the team.
    const stored = libraryTeam("friendly-league", 2, 70_000);
    saveTeams([stored]);
    const eventBus = new EventBus();
    const dice = fixedDice(6, 6, 6, 6);
    const engine = new GameService(
      eventBus,
      structuredClone(stored),
      libraryTeam("visitor", 1, 0),
      dice as never,
      {} as never
    );
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
    // Not a fixture: no Fan Factor, and a 0-0 draw rolls no Dedicated Fans
    expect(engine.getState().fanFactors).toBeUndefined();
    expect(dice.rollDie).not.toHaveBeenCalled();

    const matchCopy = engine.getTeam(stored.id)!;
    keepRecordedResult(matchCopy);
    saveTeam(matchCopy);
    expect(getTeamById("friendly-league")?.treasury).toBe(70_000);
  });
});
