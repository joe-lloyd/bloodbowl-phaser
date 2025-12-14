/**
 * Team Manager - handles team creation and persistence
 */

import { Team, createTeam, RosterName, TeamColors } from "../../types/Team";

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
