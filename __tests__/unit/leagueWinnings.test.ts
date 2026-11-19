import { fixtureValue } from "../../src/testing/fixtureValue";
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
  type CompetitionContext,
  type CompetitionEntrant,
  type LeagueDoc,
  type TournamentDoc,
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
import { type Team, type TeamAdvancementMode } from "../../src/types/Team";
import { TeamBuilder } from "../utils/test-builders";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function fixedDice(...rolls: number[]) {
  const queue = [...rolls];
  return {
    rollDie: vi.fn((sides: number) => {
      const roll = queue.shift();
      if (roll === undefined) throw new Error("No fixed roll left.");
      if (roll < 1 || roll > sides)
        throw new Error(`Bad d${String(sides)}: ${String(roll)}`);
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

  const first = fixtureValue(fixtures.find(
    (fixture) => fixture.homeEntrantId === fixtureValue(entrants[0]).id
  ));
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
  it("pays half the Fan Attendance plus the team's touchdowns, plus 1 for not Stalling, times 10,000", () => {
    expect(winningsFor(8, 2, false)).toBe(70_000);
    expect(winningsFor(8, 1, false)).toBe(60_000);
    expect(winningsFor(8, 0, false)).toBe(50_000);
  });

  it("drops the +1 when a player on the team was deemed to be Stalling", () => {
    expect(winningsFor(8, 2, true)).toBe(60_000);
    expect(winningsFor(8, 0, true)).toBe(40_000);
  });

  it("pays the rulebook's worked example: 7 / 2 + 2 + 1 = 65,000", () => {
    expect(winningsFor(7, 2, false)).toBe(65_000);
    expect(winningsFor(7, 0, true)).toBe(35_000);
  });

  it("pays winner, loser and draw by the same formula", () => {
    expect(
      fixtureWinnings({ home: 3, away: 2 }, 0, 0, { home: false, away: true })
    ).toEqual({
      fanFactor: { home: 3, away: 2 },
      home: 35_000,
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
  it("pays the worked example from a played game: 70,000 and 60,000", async () => {
    const home = libraryTeam("team-a", 2, 100_000);
    const away = libraryTeam("team-b", 1, 50_000);
    const context = await league("worked", [home, away]);

    const eventBus = new EventBus();
    const dice = fixedDice(4, 6, 1, 6);
    const engine = new GameService({ eventBus: eventBus, team1: structuredClone(home), team2: structuredClone(away), rngService: dice as never, blockResolutionService: {} as never }
    );
    const state = engine.getState();

    state.paysWinnings = true;
    state.score[home.id] = 2;
    state.score[away.id] = 1;
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
    expect(state.fanFactors).toEqual({ "team-a": 4, "team-b": 4 });

    const competition = await recordCompetitionFixture(
      {
        context,homeScore: 2,awayScore: 1,progressedTeams: { home: fixtureValue(engine.getTeam(home.id)),away: fixtureValue(engine.getTeam(away.id)) },options: {
          fanFactors: {
            home: fixtureValue(fixtureValue(state.fanFactors)[home.id]),
            away: fixtureValue(fixtureValue(state.fanFactors)[away.id]),
          },
        }
      }    );

    expect(treasuryOf("team-a")).toBe(170_000);
    expect(treasuryOf("team-b")).toBe(110_000);
    const fixture = competition.fixtures.find(
      (f) => f.id === context.fixtureId
    );
    expect(fixture?.result?.winnings).toEqual({
      fanFactor: { home: 4, away: 4 },
      home: 70_000,
      away: 60_000,
    });
  });

  it("pays a side that Stalled without the +1", async () => {
    const home = libraryTeam("stall-a", 1, 0);
    const away = libraryTeam("stall-b", 1, 0);
    const context = await league("stall", [home, away]);

    await recordCompetitionFixture(
      {
        context,homeScore: 1,awayScore: 0,progressedTeams: { home: structuredClone(home),away: structuredClone(away) },options: {
          fanFactors: { home: 2,away: 2 },
          stalled: { home: true,away: false },
        }
      }    );

    expect(treasuryOf("stall-a")).toBe(30_000);
    expect(treasuryOf("stall-b")).toBe(30_000);
  });

  it("pays a result recorded by score only, rolling The Fans on fixed dice", async () => {
    const home = libraryTeam("score-a", 2, 100_000);
    const away = libraryTeam("score-b", 1, 50_000);
    const context = await league("score-only", [home, away]);

    await recordCompetitionFixture({
        context,homeScore: 2,awayScore: 1,options: {
          rng: fixedDice(4,6),
        }
      });

    expect(treasuryOf("score-a")).toBe(170_000);
    expect(treasuryOf("score-b")).toBe(110_000);
  });

  it("pays once when the result is recorded again or the page reloads", async () => {
    const home = libraryTeam("once-a", 2, 100_000);
    const away = libraryTeam("once-b", 1, 50_000);
    const context = await league("once", [home, away]);
    const played = {
      home: structuredClone(home),
      away: structuredClone(away),
    };

    await recordCompetitionFixture({
        context,homeScore: 2,awayScore: 1,progressedTeams: played,options: {
          fanFactors: { home: 4,away: 4 },
        }
      });

    await recordCompetitionFixture({
        context,homeScore: 2,awayScore: 1,progressedTeams: played,options: {
          fanFactors: { home: 6,away: 6 },
        }
      });
    await recordCompetitionFixture({
        context,homeScore: 2,awayScore: 1,options: {
          rng: fixedDice(6,6),
        }
      });

    expect(treasuryOf("once-a")).toBe(170_000);
    expect(treasuryOf("once-b")).toBe(110_000);
  });

  it("keeps the winnings when the results screen saves its kick-off copy", async () => {
    const home = libraryTeam("keep-a", 2, 100_000);
    const away = libraryTeam("keep-b", 1, 50_000);
    const context = await league("keep", [home, away]);
    const matchCopy = structuredClone(home);

    await recordCompetitionFixture(
      { context,homeScore: 2,awayScore: 1,progressedTeams: { home: structuredClone(home),away: structuredClone(away) },options: { fanFactors: { home: 4,away: 4 } } }    );

    keepRecordedResult(matchCopy);
    saveTeam(matchCopy);

    expect(getTeamById("keep-a")?.treasury).toBe(170_000);
  });

  it("pays a penalty-free set-up concession by the normal formula", async () => {
    const home = libraryTeam("concede-a", 1, 0);
    const away = libraryTeam("concede-b", 1, 0);
    const context = await league("concede", [home, away]);

    await recordCompetitionFixture(
      { context,homeScore: 0,awayScore: 0,progressedTeams: { home: structuredClone(home),away: structuredClone(away) },options: { fanFactors: { home: 2,away: 3 } } }    );

    expect(treasuryOf("concede-a")).toBe(35_000);
    expect(treasuryOf("concede-b")).toBe(35_000);
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
      fixtureId: fixtureValue(fixtures[0]).id,
    };

    const eventBus = new EventBus();
    const dice = fixedDice(2, 1);
    const engine = new GameService({ eventBus: eventBus, team1: fixtureValue(structuredClone(teams[0])), team2: fixtureValue(structuredClone(teams[1])), rngService: dice as never, blockResolutionService: {} as never }
    );
    const state = engine.getState();
    state.knockout = true;
    state.score[fixtureValue(teams[0]).id] = 2;
    state.score[fixtureValue(teams[1]).id] = 1;
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });
    expect(state.fanFactors).toBeUndefined();
    expect(dice.rollDie).toHaveBeenCalledTimes(2);
    expect(engine.getTeam(fixtureValue(teams[0]).id)?.dedicatedFans).toBe(3);
    expect(engine.getTeam(fixtureValue(teams[1]).id)?.dedicatedFans).toBe(1);

    const updated = await recordCompetitionFixture(
      {
        context,homeScore: 2,awayScore: 1,progressedTeams: {
          home: fixtureValue(engine.getTeam(fixtureValue(teams[0]).id)),
          away: fixtureValue(engine.getTeam(fixtureValue(teams[1]).id)),
        },options: { fanFactors: { home: 4,away: 4 } }
      }    );
    expect(fixtureValue(updated.fixtures[0]).result?.winnings).toBeUndefined();
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
    const dice = fixedDice();

    await recordCompetitionFixture(
    {
      context: {
        competitionType: "tournament",
        competitionId: pool.id,
        fixtureId: fixtureValue(fixtures[0]).id,
      },homeScore: 2,awayScore: 1,options: { rng: dice }
    }    );

    expect(dice.rollDie).not.toHaveBeenCalled();
    expect(treasuryOf("pool-a")).toBe(100_000);
    expect(treasuryOf("pool-b")).toBe(50_000);
  });

  it("a Matched Play team in a league takes no winnings", async () => {
    const home = libraryTeam("mp-a", 0, 100_000, "matched-play");
    const away = libraryTeam("mp-b", 0, 50_000, "matched-play");
    const context = await league("matched", [home, away]);

    await recordCompetitionFixture({
        context,homeScore: 2,awayScore: 1,options: {
          rng: fixedDice(6,6),
        }
      });

    expect(treasuryOf("mp-a")).toBe(100_000);
    expect(treasuryOf("mp-b")).toBe(50_000);
  });

  it("a game with no league team rolls no Fan Factors and records none", async () => {
    const home = libraryTeam("friendly-a", 0, 100_000, "matched-play");
    const away = libraryTeam("friendly-b", 0, 50_000, "matched-play");
    const eventBus = new EventBus();
    const dice = fixedDice();
    const engine = new GameService({ eventBus: eventBus, team1: home, team2: away, rngService: dice as never, blockResolutionService: {} as never }
    );
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });

    expect(engine.getState().fanFactors).toBeUndefined();
    expect(dice.rollDie).not.toHaveBeenCalled();
  });

  it("a league team's friendly match leaves its stored Treasury unchanged", () => {
    const stored = libraryTeam("friendly-league", 2, 70_000);
    saveTeams([stored]);
    const eventBus = new EventBus();
    const dice = fixedDice(6, 6, 6, 6);
    const engine = new GameService({ eventBus: eventBus, team1: structuredClone(stored), team2: libraryTeam("visitor", 1, 0), rngService: dice as never, blockResolutionService: {} as never }
    );
    eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.GAME_OVER });

    expect(engine.getState().fanFactors).toBeUndefined();
    expect(dice.rollDie).not.toHaveBeenCalled();

    const matchCopy = fixtureValue(engine.getTeam(stored.id));
    keepRecordedResult(matchCopy);
    saveTeam(matchCopy);
    expect(getTeamById("friendly-league")?.treasury).toBe(70_000);
  });
});
