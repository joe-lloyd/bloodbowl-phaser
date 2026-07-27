import { Team, createTeam, addPlayerToTeam, RosterName } from "../types/Team";
import { createPlayer } from "../types/Player";
import { getRosterByRosterName } from "../data/RosterTemplates";

/** One line of a Sevens squad: hire `count` of this roster position. */
export interface CompositionLine {
  position: string;
  count: number;
}

/**
 * The Sevens squad each roster fields for generated teams.
 *
 * Scenario fixtures address players by index into `team.players`
 * (`PlayerPlacement.playerIndex`, `PlayerRef` "team1:3"), so this table is
 * what turns "the Gnoblar with Right Stuff" into a stable index. It is
 * exported for that reason — the roster-fixture resolver reads it rather
 * than duplicating the knowledge.
 *
 * Rosters not listed here fall back to seven of their first position.
 */
export const SEVENS_COMPOSITIONS: Partial<
  Record<RosterName, CompositionLine[]>
> = {
  [RosterName.AMAZON]: [
    { position: "Piranha Warrior", count: 1 }, // Blitzer
    { position: "Python Warrior", count: 1 }, // Thrower
    { position: "Eagle Warrior", count: 5 }, // Linewomen
  ],
  [RosterName.BLACK_ORC]: [
    { position: "Black Orc", count: 3 },
    { position: "Goblin Bruiser", count: 4 },
  ],
  [RosterName.BRETONIAN]: [
    { position: "Grail Knight", count: 1 },
    { position: "Bretonian Squire", count: 6 },
  ],
  // Indices: 0-1 Ogre Blocker (Throw Team-mate), 2 Ogre Runt Punter
  // (Kick Team-mate), 3-6 Gnoblar Lineman (Right Stuff, ST 1).
  [RosterName.OGRE]: [
    { position: "Ogre Blocker", count: 2 },
    { position: "Ogre Runt Punter", count: 1 },
    { position: "Gnoblar Lineman", count: 4 },
  ],
  // Index 0 Trained Troll (Always Hungry + Throw Team-mate natively),
  // 1-3 Goblin Lineman (Right Stuff), then the Secret-Weapon specialists
  // so the sandbox demos field the real players: 4 Loony (Chainsaw),
  // 5 Bomma (Bombardier), 6 Fanatic (Ball & Chain).
  [RosterName.GOBLIN]: [
    { position: "Trained Troll", count: 1 },
    { position: "Goblin Lineman", count: 3 },
    { position: "Loony", count: 1 },
    { position: "Bomma", count: 1 },
    { position: "Fanatic", count: 1 },
  ],
  // Both roster-legal Assassins make it possible to verify that one
  // replacement Blitz spends the team action for the other player too.
  [RosterName.DARK_ELF]: [
    { position: "Assassin", count: 2 },
    { position: "Dark Elf Lineman", count: 5 },
  ],
  // A roster-default Breathe Fire holder plus six ordinary players.
  [RosterName.CHAOS_DWARF]: [
    { position: "Chaos Dwarf Flamesmith", count: 1 },
    { position: "Hobgoblin Lineman", count: 6 },
  ],
  // A roster-default Projectile Vomit holder plus six Right Stuff mates.
  [RosterName.UNDERWORLD_DENIZENS]: [
    { position: "Underworld Troll", count: 1 },
    { position: "Underworld Goblin Lineman", count: 6 },
  ],
  // Rotters have Primary Mutation access, making Monstrous Mouth a
  // legal advancement for scenario fixtures that document the grant.
  [RosterName.NURGLE]: [{ position: "Rotter Lineman", count: 7 }],
};

/**
 * The composition a roster actually fields, including the default fallback.
 * Returns null when the roster has no templates at all.
 */
export function compositionFor(
  rosterName: RosterName
): CompositionLine[] | null {
  const explicit = SEVENS_COMPOSITIONS[rosterName];
  if (explicit) return explicit;
  const roster = getRosterByRosterName(rosterName);
  if (!roster || roster.playerTemplates.length === 0) return null;
  return [{ position: roster.playerTemplates[0].positionName, count: 7 }];
}

/**
 * The position name occupying each `team.players` index, i.e. what
 * `PlayerRef` "team1:3" resolves to for this roster.
 */
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

    for (const line of compositionFor(rosterName) ?? []) {
      hire(line.position, line.count);
    }

    return team;
  }
}
