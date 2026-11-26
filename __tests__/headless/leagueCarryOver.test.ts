import { parseJson } from "../../src/boundary/json";
import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { TeamFactory } from "../../src/game/TeamFactory";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { InjuryType, PlayerStatus, createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { eligibleSkillSelectionPlayers } from "../../src/game/progression/advancementModes";
import {
  RosterName,
  type Team,
  type TeamAdvancementMode,
  calculateTeamValue,
} from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import { GamePhase } from "../../src/types/GameState";
import { GameService } from "../../src/services/GameService";
import {
  dehydrateTeam,
  hydrateStoredTeam,
} from "../../src/data/persistence/teamPersistence";

function team(
  id: string,
  size: number,
  mode: TeamAdvancementMode = "sevens-skill-selection"
): Team {
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
  built.advancementMode = mode;
  return built;
}

function startGame(
  home: Team,
  away: Team = team("away", 7),
  { leagueFixture = true }: { leagueFixture?: boolean } = {}
): HeadlessGame {
  return new HeadlessGame({
    team1: home,
    team2: away,
    seed: 1,
    startingPhase: GamePhase.SETUP,
    paysWinnings: leagueFixture,
  });
}

const reload = (saved: Team): Team =>
  hydrateStoredTeam(
    parseJson(
      JSON.stringify(dehydrateTeam(saved)),
      z.record(z.string(), z.unknown())
    )
  ).team;

describe("Miss Next Game", () => {
  it("sits the player out of the next league game, after which they recover", () => {
    const home = team("home", 9);
    const injured = home.players[0];
    fixtureValue(injured).injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = startGame(home);
    const inMatch = game.ctx.team1.players.find(
      (p) => p.id === fixtureValue(injured).id
    );
    expect(inMatch?.status).toBe(PlayerStatus.INJURED);
    expect(inMatch?.injuries).toEqual([]);
    expect(
      game.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(8);

    const next = startGame(reload(game.ctx.team1));
    expect(
      next.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(9);
  });

  it("keeps a Matched Play player available: injuries do not carry there", () => {
    const home = team("home", 9, "matched-play");
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = startGame(home);
    expect(fixtureValue(game.ctx.team1.players[0]).status).toBe(
      PlayerStatus.RESERVE
    );
  });

  it("lets a league player play a friendly and keeps the record for the next league game", () => {
    const home = team("home", 9);
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    const friendly = startGame(home, undefined, { leagueFixture: false });
    const inMatch = fixtureValue(friendly.ctx.team1.players[0]);
    expect(inMatch.status).toBe(PlayerStatus.RESERVE);
    expect(inMatch.injuries).toEqual([InjuryType.MISS_NEXT_GAME]);
  });

  it("still sits the player out of a tournament game", () => {
    const home = team("home", 9);
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = new HeadlessGame({
      team1: home,
      team2: team("away", 7),
      seed: 1,
      startingPhase: GamePhase.SETUP,
      competition: true,
    });
    expect(fixtureValue(game.ctx.team1.players[0]).status).toBe(
      PlayerStatus.INJURED
    );
  });

  it("stays on a reloaded league player, while Badly Hurt does not", () => {
    const home = team("home", 9);
    fixtureValue(home.players[0]).injuries.push(
      InjuryType.BADLY_HURT,
      InjuryType.MISS_NEXT_GAME
    );
    fixtureValue(home.players[1]).injuries.push(InjuryType.BADLY_HURT);

    const loaded = reload(home);
    expect(fixtureValue(loaded.players[0]).injuries).toEqual([
      InjuryType.MISS_NEXT_GAME,
    ]);
    expect(fixtureValue(loaded.players[1]).injuries).toEqual([]);
  });

  it("is never stored on a Matched Play team, nor is any injury", () => {
    const home = team("home", 9, "matched-play");
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);
    fixtureValue(home.players[1]).injuries.push(InjuryType.DEAD);
    fixtureValue(home.players[2]).injuries.push(InjuryType.BADLY_HURT);

    const loaded = reload(home);
    expect(loaded.players).toHaveLength(9);
    expect(loaded.players.flatMap((p) => p.injuries)).toEqual([]);
  });

  it("is left out of team value until served", () => {
    const home = team("home", 9);
    const full = calculateTeamValue(home);
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    expect(calculateTeamValue(home)).toBe(
      full - fixtureValue(home.players[0]).cost
    );
    expect(reload(home).teamValue).toBe(
      full - fixtureValue(home.players[0]).cost
    );

    expect(calculateTeamValue(startGame(home).ctx.team1)).toBe(
      full - fixtureValue(home.players[0]).cost
    );
  });
});

describe("Dead", () => {
  it("removes a dead league player from the Team Draft List on load", () => {
    const home = team("home", 9);
    const dead = home.players[2];
    fixtureValue(dead).injuries.push(InjuryType.DEAD);

    const loaded = reload(home);
    expect(loaded.players.map((p) => p.id)).not.toContain(
      fixtureValue(dead).id
    );
    expect(loaded.players).toHaveLength(8);
    expect(loaded.teamValue).toBe(
      calculateTeamValue(team("home", 9)) - fixtureValue(dead).cost
    );
  });

  it("never fields a dead player still on an unsaved roster", () => {
    const home = team("home", 9);
    fixtureValue(home.players[2]).injuries.push(InjuryType.DEAD);

    const game = startGame(home);
    expect(fixtureValue(game.ctx.team1.players[2]).status).toBe(
      PlayerStatus.DEAD
    );
  });

  it("never fields a dead player in a friendly either", () => {
    const home = team("home", 9);
    fixtureValue(home.players[2]).injuries.push(InjuryType.DEAD);

    const game = startGame(home, undefined, { leagueFixture: false });
    expect(fixtureValue(game.ctx.team1.players[2]).status).toBe(
      PlayerStatus.DEAD
    );
  });
});

const journeymen = (t: Team) =>
  t.players.filter((p) => p.playerKind === "journeyman");

describe("Journeymen (L2)", () => {

  it("brings a team that cannot field 7 up to exactly 7, with Loner (5+)", () => {
    const home = team("home", 7);
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = startGame(home);
    const hired = journeymen(game.ctx.team1);
    expect(hired).toHaveLength(1);
    expect(fixtureValue(hired[0]).positionName).toBe("Human Lineman");
    expect(fixtureValue(hired[0]).status).toBe(PlayerStatus.RESERVE);
    expect(
      fixtureValue(hired[0])
        .skills.filter((s) => s.type === SkillType.LONER)
        .map((s) => s.parameter)
    ).toEqual(["5+"]);
    expect(
      game.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(7);
  });

  it("hires none while 7 players are available", () => {
    const home = team("home", 8);
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);

    expect(journeymen(startGame(home).ctx.team1)).toEqual([]);
  });

  it("fills a roster that injuries took below 7", () => {
    const game = startGame(team("home", 5));
    expect(journeymen(game.ctx.team1)).toHaveLength(2);
  });

  it("leaves after the game: a reloaded team has none", () => {
    const game = startGame(team("home", 6));
    expect(journeymen(game.ctx.team1)).toHaveLength(1);
    expect(journeymen(reload(game.ctx.team1))).toEqual([]);
  });

  it("is never offered the game's Skill Selection, since they leave", () => {
    const game = startGame(team("home", 6));
    const [journeyman] = journeymen(game.ctx.team1);
    expect(eligibleSkillSelectionPlayers(game.ctx.team1)).not.toContain(
      fixtureValue(journeyman).id
    );
    expect(eligibleSkillSelectionPlayers(game.ctx.team1)).toHaveLength(6);
  });

  it("are never taken on by a Matched Play team", () => {
    const game = startGame(team("home", 6, "matched-play"));
    expect(journeymen(game.ctx.team1)).toEqual([]);
  });

  it("are never taken on outside a league fixture: friendlies and tournament games play short", () => {
    const game = startGame(team("home", 5), team("away", 7), {
      leagueFixture: false,
    });
    expect(journeymen(game.ctx.team1)).toEqual([]);
    expect(
      game.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(5);
    expect(game.ctx.gameService.getState().paysWinnings).toBeUndefined();
  });
});

describe("a resumed match", () => {
  it("keeps its saved state and teams, even given a starting phase", () => {
    const home = team("home", 6);
    fixtureValue(home.players[0]).injuries.push(InjuryType.MISS_NEXT_GAME);
    const away = team("away", 7);
    const initialState = GameService.createInitialState({
      team1: home,
      team2: away,
      startingPhase: GamePhase.PLAY,
    });
    const game = new HeadlessGame({
      team1: home,
      team2: away,
      seed: 1,
      initialState,
      startingPhase: GamePhase.SETUP,
    });
    expect(game.ctx.gameService.getState().phase).toBe(GamePhase.PLAY);

    expect(game.ctx.team1.players).toHaveLength(6);
    expect(fixtureValue(game.ctx.team1.players[0]).injuries).toEqual([
      InjuryType.MISS_NEXT_GAME,
    ]);
  });
});
