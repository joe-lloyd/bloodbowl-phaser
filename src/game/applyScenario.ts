/**
 * Apply a scenario to a pair of teams (mutating their placements/statuses)
 * and build the matching initial GameState.
 *
 * Pure with respect to services: no ServiceContainer, no events, no sound —
 * usable by both the browser ScenarioLoader and the headless engine.
 */

import { Scenario, PlayerPlacement } from "../types/Scenario";
import { Team } from "../types/Team";
import { GameState } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { getSkill, hasSkill } from "../types/Skills";
import { SetupManager } from "./managers/SetupManager";

function applyPlacements(team: Team, placements: PlayerPlacement[]): void {
  placements.forEach((p) => {
    const player = team.players[p.playerIndex];
    if (!player) return;
    player.gridPosition = { x: p.x, y: p.y };
    player.status = p.status || PlayerStatus.ACTIVE;
    if (p.stats) Object.assign(player.stats, p.stats);
    // Scenario-granted skills: additive to roster skills, marked so the
    // next scenario load strips them again
    p.skills?.forEach((entry) => {
      const type = typeof entry === "object" ? entry.type : entry;
      const parameter =
        typeof entry === "object" ? entry.parameter : undefined;
      if (hasSkill(player.skills, type)) return;
      player.skills.push({
        ...getSkill(type, parameter),
        scenarioGranted: true,
      });
    });
  });
}

export function applyScenario(
  scenario: Scenario,
  team1: Team,
  team2: Team
): GameState {
  SetupManager.sanitizeTeam(team1);
  SetupManager.sanitizeTeam(team2);

  // Skills granted by a previous scenario must not leak into this one
  [team1, team2].forEach((team) =>
    team.players.forEach((player) => {
      player.skills = player.skills.filter((s) => !s.scenarioGranted);
    })
  );

  applyPlacements(team1, scenario.setup.team1Placements);
  applyPlacements(team2, scenario.setup.team2Placements);

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
