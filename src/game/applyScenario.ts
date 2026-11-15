/**
 * Apply a scenario to a pair of teams (mutating their placements/statuses)
 * and build the matching initial GameState.
 *
 * Pure with respect to services: no ServiceContainer, no events, no sound —
 * usable by both the browser ScenarioLoader and the headless engine.
 */

import { Scenario, PlayerPlacement } from "../types/Scenario";
import { Team } from "../types/Team";
import { GameState, GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { SkillType, getSkill, hasSkill } from "../types/Skills";
import { SetupManager } from "./managers/SetupManager";
import { DesperateMeasure } from "./inducements/desperateMeasures";
import {
  MatchInducementsState,
  emptyMatchInducements,
} from "./inducements/matchInducements";

function applyPlacements(team: Team, placements: PlayerPlacement[]): void {
  placements.forEach((p) => {
    const player = team.players[p.playerIndex];
    if (!player) return;
    player.gridPosition = { x: p.x, y: p.y };
    player.status = p.status || PlayerStatus.ACTIVE;
    if (p.stats) Object.assign(player.stats, p.stats);
    if (p.veteran) player.veteran = true;
    if (p.teamCaptain) {
      player.teamCaptain = true;
      if (!hasSkill(player.skills, SkillType.PRO)) {
        player.skills.push({
          ...getSkill(SkillType.PRO),
          scenarioGranted: true,
        });
      }
    }
    player.conditions = p.conditions?.length
      ? p.conditions.map((type) => ({ type }))
      : undefined;
    // Scenario-granted skills: additive to roster skills, marked so the
    // next scenario load strips them again
    p.skills?.forEach((entry) => {
      const type = typeof entry === "object" ? entry.type : entry;
      const parameter = typeof entry === "object" ? entry.parameter : undefined;
      if (hasSkill(player.skills, type)) return;
      player.skills.push({
        ...getSkill(type, parameter),
        scenarioGranted: true,
      });
    });
  });
}

/** The scenario's Desperate Measures, already rolled; none when omitted. */
function scenarioMeasures(
  scenario: Scenario,
  team1: Team,
  team2: Team
): MatchInducementsState | undefined {
  const measures = scenario.setup.measures;
  if (!measures) return undefined;
  const state = { ...emptyMatchInducements(), rolled: true };
  for (const [team, held] of [
    [team1, measures.team1 ?? []],
    [team2, measures.team2 ?? []],
  ] as const) {
    state.measures[team.id] = held.map((measure) => ({
      measure,
      used: measure === DesperateMeasure.MAGIC_SCROLL,
    }));
    if (held.includes(DesperateMeasure.MAGIC_SCROLL)) {
      state.sportsWizards = [...(state.sportsWizards ?? []), team.id];
    }
  }
  return state;
}

/** Where the ball starts: in a carrier's hands, on the ground, or nowhere. */
function ballSquare(scenario: Scenario): { x: number; y: number } | null {
  const { team1Placements, team2Placements, ballPosition } = scenario.setup;
  const carriers = [...team1Placements, ...team2Placements].filter(
    (p) => p.hasBall
  );
  if (carriers.length + (ballPosition ? 1 : 0) > 1) {
    throw new Error(
      `Scenario "${scenario.id}" puts the ball in more than one place`
    );
  }
  const at = carriers[0] ?? ballPosition;
  return at ? { x: at.x, y: at.y } : null;
}

export function applyScenario(
  scenario: Scenario,
  team1: Team,
  team2: Team
): GameState {
  SetupManager.sanitizeTeam(team1);
  SetupManager.sanitizeTeam(team2);

  // Skills and titles granted by a previous scenario must not leak into this one
  [team1, team2].forEach((team) =>
    team.players.forEach((player) => {
      player.skills = player.skills.filter((s) => !s.scenarioGranted);
      delete player.teamCaptain;
    })
  );
  const { teamRerolls } = scenario.setup;
  if (teamRerolls?.team1 !== undefined) team1.rerolls = teamRerolls.team1;
  if (teamRerolls?.team2 !== undefined) team2.rerolls = teamRerolls.team2;

  applyPlacements(team1, scenario.setup.team1Placements);
  applyPlacements(team2, scenario.setup.team2Placements);

  const activeTeamId =
    scenario.setup.activeTeam === "team1" ? team1.id : team2.id;

  // A kickoff happens BEFORE the first turn, so it sits at turn 0; every
  // other scenario is a mid-drive situation, so it defaults to turn 2 rather
  // than making it look like the opening turn. A scenario may pin its own turn.
  const turnNumber =
    scenario.setup.turn ?? (scenario.setup.phase === GamePhase.KICKOFF ? 0 : 2);

  return {
    phase: scenario.setup.phase,
    subPhase: scenario.setup.subPhase,
    activeTeamId: activeTeamId,
    turn: {
      teamId: activeTeamId,
      turnNumber,
      isHalf2: false,
      activatedPlayerIds: new Set(),
      hasBlitzed: false,
      hasPassed: false,
      hasHandedOff: false,
      hasFouled: false,
      hasThrownTeamMate: false,
      hasKickedTeamMate: false,
      hasThrownBomb: false,
      movementUsed: new Map(),
    },
    score: {
      [team1.id]: 0,
      [team2.id]: 0,
    },
    weather: scenario.setup.weather ?? "Nice",
    ballPosition: ballSquare(scenario),
    activePlayer: null,
    ...(scenario.setup.measures
      ? { matchInducements: scenarioMeasures(scenario, team1, team2) }
      : {}),
    ...(scenario.setup.bribes
      ? {
          bribes: {
            [team1.id]: scenario.setup.bribes.team1 ?? 0,
            [team2.id]: scenario.setup.bribes.team2 ?? 0,
          },
        }
      : {}),
  };
}
