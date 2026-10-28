import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { TeamFactory } from "../../src/game/TeamFactory";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { InjuryType, PlayerStatus, createPlayer } from "../../src/types/Player";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { eligibleSkillSelectionPlayers } from "../../src/game/progression/advancementModes";
import {
  RosterName,
  Team,
  TeamAdvancementMode,
  calculateTeamValue,
} from "../../src/types/Team";
import { SkillType } from "../../src/types/Skills";
import {
  dehydrateTeam,
  hydrateStoredTeam,
} from "../../src/data/persistence/teamPersistence";

/**
 * Injuries carry between league games (docs/SEVENS_RULES.md I4, I5, L2): a
 * Miss Next Game player sits out the next game and recovers, a Dead player
 * leaves the Team Draft List, and a team short of 7 takes on Journeymen.
 */

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
      createPlayer(lineman, id, built.players.length + 1)
    );
  }
  built.players = built.players.slice(0, size);
  built.advancementMode = mode;
  return built;
}

/** Start a game: the engine readies both teams for the match. */
function startGame(home: Team, away: Team = team("away", 7)): HeadlessGame {
  return new HeadlessGame({ team1: home, team2: away, seed: 1 });
}

const reload = (saved: Team): Team =>
  hydrateStoredTeam(
    JSON.parse(JSON.stringify(dehydrateTeam(saved))) as Record<string, unknown>
  ).team;

describe("Miss Next Game", () => {
  it("sits the player out of the next league game, after which they recover", () => {
    const home = team("home", 9);
    const injured = home.players[0];
    injured.injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = startGame(home);
    const inMatch = game.ctx.team1.players.find((p) => p.id === injured.id);
    expect(inMatch?.status).toBe(PlayerStatus.INJURED);
    expect(inMatch?.injuries).toEqual([]);
    expect(
      game.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(8);

    // The team saved after that game plays the one after in full.
    const next = startGame(reload(game.ctx.team1));
    expect(
      next.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(9);
  });

  it("keeps a Matched Play player available: injuries do not carry there", () => {
    const home = team("home", 9, "matched-play");
    home.players[0].injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = startGame(home);
    expect(game.ctx.team1.players[0].status).toBe(PlayerStatus.RESERVE);
  });

  it("is left out of team value until served", () => {
    const home = team("home", 9);
    const full = calculateTeamValue(home);
    home.players[0].injuries.push(InjuryType.MISS_NEXT_GAME);

    expect(calculateTeamValue(home)).toBe(full - home.players[0].cost);
    expect(reload(home).teamValue).toBe(full - home.players[0].cost);
    // Pre-game, with the player sitting out, the CTV the inducements use.
    expect(calculateTeamValue(startGame(home).ctx.team1)).toBe(
      full - home.players[0].cost
    );
  });
});

describe("Dead", () => {
  it("removes a dead league player from the Team Draft List on load", () => {
    const home = team("home", 9);
    const dead = home.players[2];
    dead.injuries.push(InjuryType.DEAD);

    const loaded = reload(home);
    expect(loaded.players.map((p) => p.id)).not.toContain(dead.id);
    expect(loaded.players).toHaveLength(8);
    expect(loaded.teamValue).toBe(calculateTeamValue(team("home", 9)) - dead.cost);
  });

  it("never fields a dead player still on an unsaved roster", () => {
    const home = team("home", 9);
    home.players[2].injuries.push(InjuryType.DEAD);

    const game = startGame(home);
    expect(game.ctx.team1.players[2].status).toBe(PlayerStatus.DEAD);
  });
});

describe("Journeymen (L2)", () => {
  const journeymen = (t: Team) =>
    t.players.filter((p) => p.playerKind === "journeyman");

  it("brings a team that cannot field 7 up to exactly 7, with Loner (5+)", () => {
    const home = team("home", 7);
    home.players[0].injuries.push(InjuryType.MISS_NEXT_GAME);

    const game = startGame(home);
    const hired = journeymen(game.ctx.team1);
    expect(hired).toHaveLength(1);
    expect(hired[0].positionName).toBe("Human Lineman");
    expect(hired[0].status).toBe(PlayerStatus.RESERVE);
    expect(
      hired[0].skills
        .filter((s) => s.type === SkillType.LONER)
        .map((s) => s.parameter)
    ).toEqual(["5+"]);
    expect(
      game.ctx.team1.players.filter((p) => p.status === PlayerStatus.RESERVE)
    ).toHaveLength(7);
  });

  it("hires none while 7 players are available", () => {
    const home = team("home", 8);
    home.players[0].injuries.push(InjuryType.MISS_NEXT_GAME);

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
      journeyman.id
    );
    expect(eligibleSkillSelectionPlayers(game.ctx.team1)).toHaveLength(6);
  });

  it("are never taken on by a Matched Play team", () => {
    const game = startGame(team("home", 6, "matched-play"));
    expect(journeymen(game.ctx.team1)).toEqual([]);
  });
});
