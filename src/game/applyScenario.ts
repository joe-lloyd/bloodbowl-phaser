/**
 * Apply a scenario to a pair of teams (mutating their placements/statuses)
 * and build the matching initial GameState.
 *
 * Pure with respect to services: no ServiceContainer, no events, no sound —
 * usable by both the browser ScenarioLoader and the headless engine.
 */

import { Scenario } from "../types/Scenario";
import { Team } from "../types/Team";
import { GameState } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { SetupManager } from "./managers/SetupManager";

export function applyScenario(
  scenario: Scenario,
  team1: Team,
  team2: Team
): GameState {
  SetupManager.sanitizeTeam(team1);
  SetupManager.sanitizeTeam(team2);

  scenario.setup.team1Placements.forEach((p) => {
    const player = team1.players[p.playerIndex];
    if (player) {
      player.gridPosition = { x: p.x, y: p.y };
      player.status = p.status || PlayerStatus.ACTIVE;
    }
  });

  scenario.setup.team2Placements.forEach((p) => {
    const player = team2.players[p.playerIndex];
    if (player) {
      player.gridPosition = { x: p.x, y: p.y };
      player.status = p.status || PlayerStatus.ACTIVE;
    }
  });

  const activeTeamId =
    scenario.setup.activeTeam === "team1" ? team1.id : team2.id;

  return {
    phase: scenario.setup.phase,
    subPhase: scenario.setup.subPhase,
    activeTeamId: activeTeamId,
    turn: {
      teamId: activeTeamId,
      turnNumber: 1, // Start at Turn 1 for immediate play
      isHalf2: false,
      activatedPlayerIds: new Set(),
      hasBlitzed: false,
      hasPassed: false,
      hasHandedOff: false,
      hasFouled: false,
      movementUsed: new Map(),
    },
    score: {
      [team1.id]: 0,
      [team2.id]: 0,
    },
    weather: "Nice",
    ballPosition: scenario.setup.ballPosition
      ? { ...scenario.setup.ballPosition }
      : null,
    activePlayer: null,
    coachesEjected: [],
  };
}
