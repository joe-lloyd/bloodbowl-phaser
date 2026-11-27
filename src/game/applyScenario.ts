import { type Scenario, type PlayerPlacement } from "../types/Scenario";
import { type Team } from "../types/Team";
import { type GameState, GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { SkillType, getSkill, hasSkill } from "../types/Skills";
import { SetupManager } from "./managers/SetupManager";
import { DesperateMeasure } from "./inducements/desperateMeasures";
import {
  type MatchInducementsState,
  emptyMatchInducements,
} from "./inducements/matchInducements";

type Player = Team["players"][number];
type SkillEntry = NonNullable<PlayerPlacement["skills"]>[number];

function grantCaptaincy(player: Player): void {
  player.teamCaptain = true;
  if (!hasSkill(player.skills, SkillType.PRO)) {
    player.skills.push({
      ...getSkill(SkillType.PRO),
      scenarioGranted: true,
    });
  }
}

function grantScenarioSkill(player: Player, entry: SkillEntry): void {
  const type = typeof entry === "object" ? entry.type : entry;
  if (hasSkill(player.skills, type)) return;
  const parameter = typeof entry === "object" ? entry.parameter : undefined;
  player.skills.push({
    ...getSkill(type, parameter),
    scenarioGranted: true,
  });
}

function setConditions(
  player: Player,
  conditions: PlayerPlacement["conditions"]
): void {
  if (conditions?.length) {
    player.conditions = conditions.map((type) => ({ type }));
  } else {
    delete player.conditions;
  }
}

function applyPlacement(player: Player, p: PlayerPlacement): void {
  player.gridPosition = { x: p.x, y: p.y };
  player.status = p.status || PlayerStatus.ACTIVE;
  if (p.stats) Object.assign(player.stats, p.stats);
  if (p.veteran) player.veteran = true;
  if (p.teamCaptain) grantCaptaincy(player);
  setConditions(player, p.conditions);
  const skills = p.skills ?? [];
  for (const entry of skills) grantScenarioSkill(player, entry);
}

function applyPlacements(team: Team, placements: PlayerPlacement[]): void {
  for (const p of placements) {
    const player = team.players[p.playerIndex];
    if (!player) continue;
    applyPlacement(player, p);
  }
}

function clearScenarioGrants(team: Team): void {
  for (const player of team.players) {
    player.skills = player.skills.filter((s) => !s.scenarioGranted);
    delete player.teamCaptain;
  }
}

function applyRerolls(scenario: Scenario, team1: Team, team2: Team): void {
  const { teamRerolls } = scenario.setup;
  if (teamRerolls?.team1 !== undefined) team1.rerolls = teamRerolls.team1;
  if (teamRerolls?.team2 !== undefined) team2.rerolls = teamRerolls.team2;
}

function scenarioMeasures(
  scenario: Scenario,
  team1: Team,
  team2: Team
): MatchInducementsState | undefined {
  const measures = scenario.setup.measures;
  if (!measures) return undefined;
  const state = { ...emptyMatchInducements(), rolled: true };
  const teamMeasures = [
    [team1, measures.team1 ?? []],
    [team2, measures.team2 ?? []],
  ] as const;
  for (const [team, held] of teamMeasures) {
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

function scenarioOptionalFields(
  scenario: Scenario,
  team1: Team,
  team2: Team
): Partial<Pick<GameState, "matchInducements" | "bribes">> {
  const matchInducements = scenarioMeasures(scenario, team1, team2);
  return {
    ...(matchInducements && { matchInducements }),
    ...(scenario.setup.bribes && {
          bribes: {
            [team1.id]: scenario.setup.bribes.team1 ?? 0,
            [team2.id]: scenario.setup.bribes.team2 ?? 0,
          },
        }),
  };
}

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

  clearScenarioGrants(team1);
  clearScenarioGrants(team2);
  applyRerolls(scenario, team1, team2);

  applyPlacements(team1, scenario.setup.team1Placements);
  applyPlacements(team2, scenario.setup.team2Placements);

  const activeTeamId =
    scenario.setup.activeTeam === "team1" ? team1.id : team2.id;

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
    ...scenarioOptionalFields(scenario, team1, team2),
  };
}
