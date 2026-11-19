import {
  type Team,
  createTeam,
  addPlayerToTeam,
  RosterName,
} from "../types/Team";
import { createPlayer } from "../types/Player";
import { getRosterByRosterName } from "../data/RosterTemplates";

interface CompositionLine {
  position: string;
  count: number;
}

const SEVENS_COMPOSITIONS: Partial<
  Record<RosterName, CompositionLine[]>
> = {
  [RosterName.AMAZON]: [
    { position: "Piranha Warrior", count: 1 },
    { position: "Python Warrior", count: 1 },
    { position: "Eagle Warrior", count: 5 },
  ],
  [RosterName.BLACK_ORC]: [
    { position: "Black Orc", count: 3 },
    { position: "Goblin Bruiser", count: 4 },
  ],
  [RosterName.BRETONIAN]: [
    { position: "Grail Knight", count: 1 },
    { position: "Bretonian Squire", count: 6 },
  ],

  [RosterName.OGRE]: [
    { position: "Ogre Blocker", count: 2 },
    { position: "Ogre Runt Punter", count: 1 },
    { position: "Gnoblar Lineman", count: 4 },
  ],

  [RosterName.GOBLIN]: [
    { position: "Trained Troll", count: 1 },
    { position: "Goblin Lineman", count: 3 },
    { position: "Loony", count: 1 },
    { position: "Bomma", count: 1 },
    { position: "Fanatic", count: 1 },
  ],

  [RosterName.DARK_ELF]: [
    { position: "Assassin", count: 2 },
    { position: "Dark Elf Lineman", count: 5 },
  ],

  [RosterName.CHAOS_DWARF]: [
    { position: "Chaos Dwarf Flamesmith", count: 1 },
    { position: "Hobgoblin Lineman", count: 6 },
  ],

  [RosterName.UNDERWORLD_DENIZENS]: [
    { position: "Underworld Troll", count: 1 },
    { position: "Underworld Goblin Lineman", count: 6 },
  ],

  [RosterName.NURGLE]: [{ position: "Rotter Lineman", count: 7 }],

  [RosterName.SNOTLING]: [
    { position: "Pump Wagon", count: 1 },
    { position: "Trained Troll", count: 1 },
    { position: "Stilty Runna", count: 2 },
    { position: "Snotling Lineman", count: 3 },
  ],
};

function compositionFor(
  rosterName: RosterName
): CompositionLine[] | null {
  const explicit = SEVENS_COMPOSITIONS[rosterName];
  if (explicit) return explicit;
  const roster = getRosterByRosterName(rosterName);
  const first = roster?.playerTemplates[0];
  if (!first) return null;
  return [{ position: first.positionName, count: 7 }];
}

export function positionByPlayerIndex(rosterName: RosterName): string[] {
  const composition = compositionFor(rosterName);
  if (!composition) return [];
  return composition.flatMap((line) =>
    Array.from({ length: line.count }, () => line.position)
  );
}

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

    const hire = (position: string, qty: number) => {
      const template = roster.playerTemplates.find(
        (p) => p.positionName === position
      );
      if (!template) {
        console.warn(`Position ${position} not found in ${rosterName}`);
        return;
      }

      for (let i = 0; i < qty; i++) {
        const num = team.players.length + 1;
        const p = createPlayer(template, team.id, num);
        addPlayerToTeam(team, p);
      }
    };

    for (const line of compositionFor(rosterName) ?? []) {
      hire(line.position, line.count);
    }

    return team;
  }
}
