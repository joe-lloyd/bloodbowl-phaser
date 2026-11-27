import { oneBall } from "./rules/balls";
import { freshSpend } from "./rules/turnSpend";
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

type SideKey = "team1" | "team2";

interface ScenarioSide {
  readonly key: SideKey;
  readonly team: Team;
  readonly placements: PlayerPlacement[];
}

function sidesOf(
  scenario: Scenario,
  home: Team,
  away: Team
): readonly [ScenarioSide, ScenarioSide] {
  const { team1Placements, team2Placements } = scenario.setup;
  return [
    { key: "team1", team: home, placements: team1Placements },
    { key: "team2", team: away, placements: team2Placements },
  ];
}

function applyRerolls(
  scenario: Scenario,
  sides: readonly ScenarioSide[]
): void {
  const { teamRerolls } = scenario.setup;
  for (const { key, team } of sides) {
    const rerolls = teamRerolls?.[key];
    if (rerolls !== undefined) team.rerolls = rerolls;
  }
}

function scenarioMeasures(
  scenario: Scenario,
  sides: readonly ScenarioSide[]
): MatchInducementsState | undefined {
  const measures = scenario.setup.measures;
  if (!measures) return undefined;
  const state = { ...emptyMatchInducements(), rolled: true };
  for (const { key, team } of sides) {
    const held = measures[key] ?? [];
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
  sides: readonly ScenarioSide[]
): Partial<Pick<GameState, "matchInducements" | "bribes">> {
  const matchInducements = scenarioMeasures(scenario, sides);
  const { bribes } = scenario.setup;
  return {
    ...(matchInducements && { matchInducements }),
    ...(bribes && {
      bribes: Object.fromEntries(
        sides.map(({ key, team }) => [team.id, bribes[key] ?? 0])
      ),
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
  home: Team,
  away: Team
): GameState {
  const sides = sidesOf(scenario, home, away);
  for (const { team } of sides) SetupManager.sanitizeTeam(team);
  for (const { team } of sides) clearScenarioGrants(team);
  applyRerolls(scenario, sides);
  for (const { team, placements } of sides) applyPlacements(team, placements);

  const activeSide =
    sides.find(({ key }) => key === scenario.setup.activeTeam) ?? sides[1];
  const activeTeamId = activeSide.team.id;

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
      spend: freshSpend(),
      hasThrownTeamMate: false,
      hasKickedTeamMate: false,
      hasThrownBomb: false,
      movementUsed: new Map(),
    },
    score: Object.fromEntries(sides.map(({ team }) => [team.id, 0])),
    weather: scenario.setup.weather ?? "Nice",
    balls: oneBall(ballSquare(scenario)),
    activePlayer: null,
    ...scenarioOptionalFields(scenario, sides),
  };
}
