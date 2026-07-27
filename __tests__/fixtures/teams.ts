/**
 * Test fixtures - Pre-configured test data for common scenarios
 * Use these for consistent test data across test files
 */

import { Team, RosterName } from "../../src/types/Team.js";
import { PlayerStatus } from "../../src/types/Player.js";
import { TeamFactory } from "../../src/game/TeamFactory";
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
 * Named teams from the production roster templates.
 *
 * These used to be hand-built player lists with copied stats and position
 * *keywords* ("Lineman") standing in for position names ("Orc Lineman"). That
 * drifted from the roster data and taught tests to expect players who do not
 * exist. Both now go through the same factory the game uses, so a roster
 * change reaches the tests instead of hiding from them.
 */
export function createRosterTeam(
  rosterName: RosterName,
  name: string,
  color = 0x00ff00
): Team {
  return TeamFactory.createTestTeam(rosterName, name, color);
}

export function createOrcTeam(): Team {
  return createRosterTeam(RosterName.ORC, "Da Boyz", 0x00ff00);
}

export function createHumanTeam(): Team {
  return createRosterTeam(RosterName.HUMAN, "Reikland Reavers", 0x0000ff);
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
