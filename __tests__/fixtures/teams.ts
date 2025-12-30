/**
 * Test fixtures - Pre-configured test data for common scenarios
 * Use these for consistent test data across test files
 */

import { Team, RosterName } from "../../src/types/Team.js";
import { PositionKeyWord, PlayerStatus } from "../../src/types/Player.js";
import { TeamBuilder, PlayerBuilder } from "../utils/test-builders";

/**
 * Create a basic test team with default values
 */
export function createTestTeam(
  name: string = "Test Team",
  race: RosterName = RosterName.HUMAN
): Team {
  return new TeamBuilder()
    .withName(name)
    .withRosterName(race)
    .withPlayers(7)
    .build();
}

/**
 * Create an Orc team with typical Orc roster
 */
export function createOrcTeam(): Team {
  const team = new TeamBuilder()
    .withName("Da Boyz")
    .withRosterName(RosterName.ORC)
    .withColors(0x00ff00, 0x000000)
    .build();

  // Add typical Orc roster
  team.players = [
    // 4 Linemen
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(1)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 5, ST: 3, AG: 3, PA: 5, AV: 10 })
      .withCost(50000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(2)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 5, ST: 3, AG: 3, PA: 5, AV: 10 })
      .withCost(50000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(3)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 5, ST: 3, AG: 3, PA: 5, AV: 10 })
      .withCost(50000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(4)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 5, ST: 3, AG: 3, PA: 5, AV: 10 })
      .withCost(50000)
      .build(),
    // 2 Blitzers
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(5)
      .withPosition(PositionKeyWord.BLITZER)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 10 })
      .withCost(80000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(6)
      .withPosition(PositionKeyWord.BLITZER)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 10 })
      .withCost(80000)
      .build(),
    // 1 Thrower
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(7)
      .withPosition(PositionKeyWord.THROWER)
      .withStats({ MA: 5, ST: 3, AG: 3, PA: 3, AV: 9 })
      .withCost(65000)
      .build(),
  ];

  return team;
}

/**
 * Create a Human team with typical Human roster
 */
export function createHumanTeam(): Team {
  const team = new TeamBuilder()
    .withName("Reikland Reavers")
    .withRosterName(RosterName.HUMAN)
    .withColors(0x0000ff, 0xffffff)
    .build();

  // Add typical Human roster
  team.players = [
    // 4 Linemen
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(1)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
      .withCost(50000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(2)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
      .withCost(50000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(3)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
      .withCost(50000)
      .build(),
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(4)
      .withPosition(PositionKeyWord.LINEMAN)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
      .withCost(50000)
      .build(),
    // 1 Blitzer
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(5)
      .withPosition(PositionKeyWord.BLITZER)
      .withStats({ MA: 7, ST: 3, AG: 3, PA: 4, AV: 9 })
      .withCost(85000)
      .build(),
    // 1 Catcher
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(6)
      .withPosition(PositionKeyWord.CATCHER)
      .withStats({ MA: 8, ST: 2, AG: 2, PA: 5, AV: 8 })
      .withCost(65000)
      .build(),
    // 1 Thrower
    new PlayerBuilder()
      .withTeamId(team.id)
      .withNumber(7)
      .withPosition(PositionKeyWord.THROWER)
      .withStats({ MA: 6, ST: 3, AG: 3, PA: 2, AV: 9 })
      .withCost(80000)
      .build(),
  ];

  return team;
}

/**
 * Create a team with all players on the pitch (for setup testing)
 */
export function createTeamWithPlayersOnPitch(teamId: string = "team-1"): Team {
  const team = new TeamBuilder().withId(teamId).withName("Pitch Team").build();

  // Create 7 players, all on pitch in different positions
  team.players = [
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(1)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(2, 5)
      .build(),
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(2)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(3, 3)
      .build(),
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(3)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(3, 7)
      .build(),
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(4)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(4, 5)
      .build(),
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(5)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(5, 2)
      .build(),
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(6)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(5, 8)
      .build(),
    new PlayerBuilder()
      .withTeamId(teamId)
      .withNumber(7)
      .withStatus(PlayerStatus.ACTIVE)
      .withGridPosition(5, 5)
      .build(),
  ];

  return team;
}
