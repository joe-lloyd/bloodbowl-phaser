import { type Team, RosterName } from "../../src/types/Team.js";
import { TeamFactory } from "../../src/game/TeamFactory";
import { TeamBuilder } from "../utils/test-builders";

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

function createRosterTeam(
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
