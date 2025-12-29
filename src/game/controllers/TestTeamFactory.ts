import {
  Team,
  createTeam,
  addPlayerToTeam,
  RosterName,
} from "../../types/Team";
import { createPlayer } from "../../types/Player";
import { getRosterByRosterName } from "../../data/RosterTemplates";

export class TestTeamFactory {
  static createTestTeam(
    rosterName: RosterName,
    teamName: string,
    color: number
  ): Team {
    const team = createTeam(
      teamName,
      rosterName,
      { primary: color, secondary: 0xffffff },
      50000
    );

    const roster = getRosterByRosterName(rosterName);
    if (!roster) {
      console.error(`Roster ${rosterName} not found!`);
      return team;
    }

    // Helper to add player
    const hire = (position: string, qty: number) => {
      const template = roster.playerTemplates.find(
        (p) => p.positionName === position
      );
      if (!template) {
        console.warn(`Position ${position} not found in ${rosterName}`);
        return;
      }

      for (let i = 0; i < qty; i++) {
        // Auto-numbering
        const num = team.players.length + 1;
        const p = createPlayer(template, team.id, num);
        addPlayerToTeam(team, p);
      }
    };

    // balanced defaults for Sevens (7 players)
    // Adjust compositions based on race
    switch (rosterName) {
      case RosterName.AMAZON:
        hire("Piranha Warrior", 1); // Blitzer
        hire("Python Warrior", 1); // Thrower
        hire("Eagle Warrior", 5); // Linewomen
        break;
      case RosterName.BLACK_ORC:
        hire("Black Orc", 3);
        hire("Goblin Bruiser", 4);
        break;
      case RosterName.BRETONIAN:
        hire("Grail Knight", 1);
        hire("Bretonian Squire", 6);
        break;
      default:
        // Fallback: Fill with first available position (usually Lineman)
        if (roster.playerTemplates.length > 0) {
          hire(roster.playerTemplates[0].positionName, 7);
        }
    }

    return team;
  }
}
