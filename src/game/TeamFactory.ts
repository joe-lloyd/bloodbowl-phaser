import { Team, createTeam, addPlayerToTeam, RosterName } from "../types/Team";
import { createPlayer } from "../types/Player";
import { getRosterByRosterName } from "../data/RosterTemplates";

export class TeamFactory {
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
      case RosterName.OGRE:
        // Indices: 0-1 Ogre Blocker (Throw Team-mate), 2 Ogre Runt Punter
        // (Kick Team-mate), 3-6 Gnoblar Lineman (Right Stuff, ST 1).
        hire("Ogre Blocker", 2);
        hire("Ogre Runt Punter", 1);
        hire("Gnoblar Lineman", 4);
        break;
      case RosterName.GOBLIN:
        // Index 0 Trained Troll (Always Hungry + Throw Team-mate natively),
        // 1-3 Goblin Lineman (Right Stuff), then the Secret-Weapon specialists
        // so the sandbox demos field the real players: 4 Loony (Chainsaw),
        // 5 Bomma (Bombardier), 6 Fanatic (Ball & Chain).
        hire("Trained Troll", 1);
        hire("Goblin Lineman", 3);
        hire("Loony", 1);
        hire("Bomma", 1);
        hire("Fanatic", 1);
        break;
      case RosterName.DARK_ELF:
        // Both roster-legal Assassins make it possible to verify that one
        // replacement Blitz spends the team action for the other player too.
        hire("Assassin", 2);
        hire("Dark Elf Lineman", 5);
        break;
      case RosterName.CHAOS_DWARF:
        // A roster-default Breathe Fire holder plus six ordinary players.
        hire("Chaos Dwarf Flamesmith", 1);
        hire("Hobgoblin Lineman", 6);
        break;
      case RosterName.UNDERWORLD_DENIZENS:
        // A roster-default Projectile Vomit holder plus six Right Stuff mates.
        hire("Underworld Troll", 1);
        hire("Underworld Goblin Lineman", 6);
        break;
      case RosterName.NURGLE:
        // Rotters have Primary Mutation access, making Monstrous Mouth a
        // legal advancement for scenario fixtures that document the grant.
        hire("Rotter Lineman", 7);
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
