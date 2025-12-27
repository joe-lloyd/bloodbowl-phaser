/**
 * Team Manager - handles team creation and persistence
 */

import { Team, createTeam, RosterName, TeamColors } from "../../types/Team";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { createPlayer } from "../../types/Player";

const STORAGE_KEY = "bloodbowl_teams";

/**
 * Save teams to localStorage
 */
export function saveTeams(teams: Team[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch (error) {
    console.error("Failed to save teams:", error);
  }
}

/**
 * Load teams from localStorage
 */
export function loadTeams(): Team[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load teams:", error);
  }
  return [];
}

/**
 * Save a single team
 */
export function saveTeam(team: Team): void {
  const teams = loadTeams();
  const index = teams.findIndex((t) => t.id === team.id);

  if (index >= 0) {
    teams[index] = team;
  } else {
    teams.push(team);
  }

  saveTeams(teams);
}

/**
 * Delete a team
 */
export function deleteTeam(teamId: string): void {
  const teams = loadTeams();
  const filtered = teams.filter((t) => t.id !== teamId);
  saveTeams(filtered);
}

/**
 * Get team by ID
 */
export function getTeamById(teamId: string): Team | undefined {
  const teams = loadTeams();
  return teams.find((t) => t.id === teamId);
}

/**
 * Create a new team with default settings
 */
export function createNewTeam(
  name: string,
  rosterName: RosterName,
  colors: TeamColors,
  rerollCost: number
): Team {
  const team = createTeam(name, rosterName, colors, rerollCost);
  saveTeam(team);
  return team;
}

/**
 * Seed sample teams for all roster types (for testing/demo purposes)
 * Creates one team for each roster with 7 players
 */
export function seedAllRosterTeams(): void {
  const rosterColors: Record<string, TeamColors> = {
    [RosterName.AMAZON]: { primary: 0x228b22, secondary: 0xffd700 },
    [RosterName.BLACK_ORC]: { primary: 0x2f4f4f, secondary: 0xff0000 },
    [RosterName.BRETONIAN]: { primary: 0x4169e1, secondary: 0xffd700 },
    [RosterName.CHAOS_CHOSEN]: { primary: 0x8b0000, secondary: 0x000000 },
    [RosterName.CHAOS_DWARF]: { primary: 0x8b4513, secondary: 0xff4500 },
    [RosterName.CHAOS_RENEGADE]: { primary: 0x483d8b, secondary: 0x9370db },
    [RosterName.DARK_ELF]: { primary: 0x4b0082, secondary: 0xc0c0c0 },
    [RosterName.DWARF]: { primary: 0xb8860b, secondary: 0x000000 },
    [RosterName.ELVEN_UNION]: { primary: 0x00ced1, secondary: 0xffffff },
    [RosterName.GNOME]: { primary: 0xff69b4, secondary: 0x32cd32 },
    [RosterName.GOBLIN]: { primary: 0x32cd32, secondary: 0xffff00 },
    [RosterName.HALFLING]: { primary: 0x8b4513, secondary: 0xffd700 },
    [RosterName.HIGH_ELF]: { primary: 0xffffff, secondary: 0x4169e1 },
    [RosterName.HUMAN]: { primary: 0x0000ff, secondary: 0xffffff },
    [RosterName.IMPERIAL_NOBILITY]: { primary: 0x800020, secondary: 0xffd700 },
    [RosterName.KHORNE]: { primary: 0x8b0000, secondary: 0xff0000 },
    [RosterName.LIZARDMEN]: { primary: 0x228b22, secondary: 0xffd700 },
    [RosterName.NECROMANTIC_HORROR]: { primary: 0x2f4f4f, secondary: 0x00ff00 },
    [RosterName.NORSE]: { primary: 0x4682b4, secondary: 0xffffff },
    [RosterName.NURGLE]: { primary: 0x556b2f, secondary: 0x9acd32 },
    [RosterName.OGRE]: { primary: 0xa0522d, secondary: 0xffffff },
    [RosterName.OLD_WORLD_ALLIANCE]: { primary: 0x4169e1, secondary: 0xffd700 },
    [RosterName.ORC]: { primary: 0x006400, secondary: 0x000000 },
    [RosterName.SHAMBLING_UNDEAD]: { primary: 0x2f4f4f, secondary: 0x8b0000 },
    [RosterName.SKAVEN]: { primary: 0x8b4513, secondary: 0x000000 },
    [RosterName.SNOTLING]: { primary: 0x32cd32, secondary: 0xff0000 },
    [RosterName.TOMB_KINGS]: { primary: 0xdaa520, secondary: 0x4169e1 },
    [RosterName.UNDERWORLD_DENIZENS]: {
      primary: 0x2f4f4f,
      secondary: 0x9370db,
    },
    [RosterName.VAMPIRE]: { primary: 0x8b0000, secondary: 0x000000 },
    [RosterName.WOOD_ELF]: { primary: 0x228b22, secondary: 0x8b4513 },
  };

  const existingTeams = loadTeams();
  const newTeams: Team[] = [];

  // Create a team for each roster type
  Object.values(RosterName).forEach((rosterName) => {
    // Skip if team already exists for this roster
    if (existingTeams.some((t) => t.rosterName === rosterName)) {
      return;
    }

    const colors = rosterColors[rosterName] || {
      primary: 0x0000ff,
      secondary: 0xffffff,
    };
    const team = createTeam(
      `${rosterName} Sample`,
      rosterName,
      colors,
      60000, // Default reroll cost
      600000 // Starting treasury
    );

    // Get roster template and add 7 players
    try {
      const roster = getRosterByRosterName(rosterName);
      let playerNumber = 1;

      // Add players from templates (up to 7)
      for (const template of roster.playerTemplates) {
        if (playerNumber > 7) break;

        // Add 1-2 players of each type
        const count = Math.min(
          template.maxAllowed || 1,
          7 - playerNumber + 1,
          2
        );
        for (let i = 0; i < count && playerNumber <= 7; i++) {
          const player = createPlayer(template, team.id, playerNumber);
          team.players.push(player);
          playerNumber++;
        }
      }
    } catch (error) {
      console.warn(`Failed to add players for ${rosterName}:`, error);
    }

    newTeams.push(team);
  });

  // Save all new teams
  if (newTeams.length > 0) {
    saveTeams([...existingTeams, ...newTeams]);
  }
}

/**
 * Delete all seed teams (teams ending with " Sample")
 */
export function deleteAllSeedTeams(): void {
  const teams = loadTeams();
  const nonSeedTeams = teams.filter((t) => !t.name.endsWith(" Sample"));
  saveTeams(nonSeedTeams);
}
