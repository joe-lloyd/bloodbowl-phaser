import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { TeamBuilder } from "../utils/test-builders";
import { RosterName } from "../../src/types/Team";
import {
  PLAYED_GAMES_KEPT,
  playedGameFor,
  withPlayedGame,
} from "../../src/game/progression/matchHistory";
import {
  dehydrateTeam,
  readStoredTeam,
} from "../../src/data/persistence/teamPersistence";
import { type PlayerMatchStats } from "../../src/game/progression/MatchStats";

const home = new TeamBuilder()
  .withId("home")
  .withName("Reikland Reavers")
  .withRosterName(RosterName.HUMAN)
  .withPlayers(3)
  .build();
const away = new TeamBuilder()
  .withId("away")
  .withName("Gouged Eye")
  .withRosterName(RosterName.HUMAN)
  .withPlayers(3)
  .build();

const line = (
  playerId: string,
  teamId: string,
  extra: Partial<PlayerMatchStats> = {}
): PlayerMatchStats => ({
  playerId,
  teamId,
  participated: true,
  completions: 0,
  attempts: 0,
  superbThrows: 0,
  safeLandings: 0,
  interceptions: 0,
  casualties: 0,
  kills: 0,
  touchdowns: 0,
  mvps: 0,
  blocks: 0,
  yards: 0,
  injuriesSuffered: 0,
  sppEarned: 0,
  ...extra,
});

const meta = {
  id: "match-1",
  playedAt: 1_700_000_000_000,
  kind: "online" as const,
};

describe("playedGameFor", () => {
  it("records the score, the outcome and the players who did something", () => {
    const [scorer, quiet, hurt] = home.players;
    const game = playedGameFor(
      home,
      away,
      { score: { home: 2, away: 1 } },
      [
        line(fixtureValue(scorer).id, "home", { touchdowns: 2, mvps: 1 }),
        line(fixtureValue(quiet).id, "home"),
        line(fixtureValue(hurt).id, "home", { injuriesSuffered: 1 }),
        line(fixtureValue(away.players[0]).id, "away", { touchdowns: 1 }),
      ],
      meta
    );
    expect(game).toMatchObject({
      id: "match-1",
      kind: "online",
      opponent: { name: "Gouged Eye", rosterName: RosterName.HUMAN },
      score: { own: 2, opponent: 1 },
      outcome: "win",
    });
    expect(
      game.players.map((p) => [p.playerId, p.touchdowns, p.mvp, p.injured])
    ).toEqual([
      [fixtureValue(scorer).id, 2, true, false],
      [fixtureValue(hurt).id, 0, false, true],
    ]);
  });

  it("counts a concession as a loss for the side that conceded, whatever the score", () => {
    const game = playedGameFor(
      home,
      away,
      {
        score: { home: 1, away: 0 },
        result: { reason: "concession", concedingTeamId: "home" },
      },
      [],
      meta
    );
    expect(game).toMatchObject({ outcome: "loss", ending: "conceded" });
  });

  it("settles a level knockout tie on Penalties", () => {
    const game = playedGameFor(
      away,
      home,
      {
        score: { home: 1, away: 1 },
        result: { reason: "completed", penalties: { home: 3, away: 1 } },
      },
      [],
      meta
    );
    expect(game).toMatchObject({ outcome: "loss", ending: "penalties" });
  });
});

describe("a team's played games", () => {
  it("records a game once and keeps the newest", () => {
    let team = home;
    for (let i = 0; i < PLAYED_GAMES_KEPT + 5; i++) {
      team = withPlayedGame(
        team,
        playedGameFor(team, away, { score: {} }, [], {
          ...meta,
          id: `m${String(i)}`,
        })
      );
    }
    team = withPlayedGame(
      team,
      playedGameFor(team, away, { score: {} }, [], { ...meta, id: "m104" })
    );
    expect(team.playedGames).toHaveLength(PLAYED_GAMES_KEPT);
    expect(fixtureValue(fixtureValue(team.playedGames)[0]).id).toBe(`m${String(PLAYED_GAMES_KEPT + 4)}`);
  });

  it("survives a save and load, and a damaged entry is dropped", () => {
    const team = withPlayedGame(
      home,
      playedGameFor(home, away, { score: { home: 1, away: 0 } }, [], meta)
    );
    const stored = {
      ...dehydrateTeam(team),
      playedGames: [...fixtureValue(team.playedGames), { id: 7, kind: "nonsense" }],
    };
    const loaded = readStoredTeam(JSON.parse(JSON.stringify(stored))).team;
    expect(loaded.playedGames).toEqual(team.playedGames);
  });
});
