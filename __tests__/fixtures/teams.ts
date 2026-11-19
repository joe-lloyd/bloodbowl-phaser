import { type Team, RosterName } from "../../src/types/Team.js";
import { PlayerStatus } from "../../src/types/Player.js";
import { TeamFactory } from "../../src/game/TeamFactory";
import { TeamBuilder, PlayerBuilder } from "../utils/test-builders";

export function createTestTeam(
  name = "Test Team",
  race: RosterName = RosterName.HUMAN
): Team {
  return new TeamBuilder()
    .withName(name)
    .withRosterName(race)
    .withPlayers(7)
    .build();
}

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

export function createTeamWithPlayersOnPitch(teamId = "team-1"): Team {
  const team = new TeamBuilder().withId(teamId).withName("Pitch Team").build();

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
