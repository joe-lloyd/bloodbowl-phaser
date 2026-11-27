import {
  type MatchFormat,
  withMatchFormat,
} from "../game/variants/activeMatch";
import { EventBus, type IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import {
  RNGService,
  type IRNGService,
  type RNGState,
} from "../services/rng/RNGService";
import { BlockResolutionService } from "../services/BlockResolutionService";
import { applyScenario } from "../game/applyScenario";
import { type DelayProvider, noDelay } from "../game/core/GameFlowManager";
import { TeamFactory } from "../game/TeamFactory";
import { type Team, RosterName } from "../types/Team";
import { type GameState, GamePhase, SubPhase } from "../types/GameState";
import { type Scenario } from "../types/Scenario";
import {
  MatchStats,
  type MatchStatsSnapshot,
} from "../game/progression/MatchStats";
import { type MatchSave, restoreMatchSave } from "./serialization";
import { type TurnManagerState } from "../game/managers/TurnManager";
import { type SeatedTeams, seatedTeams } from "../game/seating";

export interface HeadlessGameOptions {
  ctx?: HeadlessGameContext;

  autoStartOnReady?: boolean;

  teams?: readonly Team[];

  seed?: number | undefined;

  scenario?: Scenario | undefined;

  initialState?: GameState;

  lazySnapshots?: boolean;

  delay?: DelayProvider;

  startingPhase?: GamePhase | undefined;
  startingSubPhase?: SubPhase;

  defaultRoster?: RosterName;

  progressionEnabled?: boolean;

  knockout?: boolean | undefined;

  paysWinnings?: boolean;
  competition?: boolean;

  format?: MatchFormat;

  rngState?: RNGState;

  matchStatsState?: MatchStatsSnapshot;

  turnManagerState?: TurnManagerState;

  matchSave?: MatchSave;

  kickingTeamId?: string | null;
}

export interface HeadlessGameContext {
  eventBus: IEventBus;
  gameService: GameService;
  rng: IRNGService;
  teams: SeatedTeams;
  seed: number;
  matchStats: MatchStats;
}

export function stabilizeIds(team: Team, stableId: string): Team {
  team.id = stableId;
  for (const p of team.players) {
    p.teamId = stableId;
    p.id = `${stableId}-player-${String(p.number)}`;
  }
  return team;
}

type RestoredSave = ReturnType<typeof restoreMatchSave> | null;

function matchTeams(
  options: HeadlessGameOptions,
  restored: RestoredSave
): SeatedTeams {
  if (restored) return restored.teams;
  if (options.teams) return seatedTeams(options.teams);
  const roster = options.defaultRoster ?? RosterName.HUMAN;
  const { team1Roster = roster, team2Roster = roster } =
    options.scenario?.setup ?? {};
  return [
    stabilizeIds(
      TeamFactory.createTestTeam(team1Roster, "Home Team", 0xcc0000),
      "team1"
    ),
    stabilizeIds(
      TeamFactory.createTestTeam(team2Roster, "Away Team", 0x0000cc),
      "team2"
    ),
  ];
}

function savedInputs(options: HeadlessGameOptions, restored: RestoredSave) {
  const rngState = restored?.save.rng ?? options.rngState;
  const matchStatsState = restored?.save.matchStats ?? options.matchStatsState;
  const seed =
    rngState?.initialSeed ??
    options.seed ??
    options.scenario?.seed ??
    Date.now();
  return { rngState, matchStatsState, seed };
}

const formatOption = (options: HeadlessGameOptions) =>
  options.format === undefined ? {} : { format: options.format };

function scenarioState(
  options: HeadlessGameOptions,
  scenario: Scenario,
  [team1, team2]: SeatedTeams
): GameState {
  const { format } = options;
  if (!format) return applyScenario(scenario, team1, team2);
  const state = withMatchFormat(format, () =>
    applyScenario(scenario, team1, team2)
  );
  return { ...state, gameType: format.gameType, venue: format.venue };
}

const savedTurnManager = (
  options: HeadlessGameOptions,
  restored: RestoredSave
) => restored?.save.turnManager ?? options.turnManagerState;

function startingState(
  options: HeadlessGameOptions,
  restored: RestoredSave,
  teams: SeatedTeams
): GameState | undefined {
  const initialState: GameState | undefined =
    restored?.state ?? options.initialState;
  if (initialState) return initialState;
  if (options.scenario) return scenarioState(options, options.scenario, teams);
  return freshMatchState(options, teams);
}

function freshMatchState(
  options: HeadlessGameOptions,
  teams: SeatedTeams
): GameState | undefined {
  const fixture = {
    ...(options.paysWinnings && { paysWinnings: true }),
    ...(options.competition && { competition: true }),
  };
  if (options.startingPhase) {
    return GameService.createMatchState({
      teams,
      startingPhase: options.startingPhase,
      ...(options.startingSubPhase !== undefined && { startingSubPhase: options.startingSubPhase }),
      fixture,
      ...formatOption(options),
    });
  }
  if (options.paysWinnings || options.competition || options.format) {
    return GameService.createMatchState({
      teams,
      startingPhase: GamePhase.SANDBOX_IDLE,
      fixture,
      ...formatOption(options),
    });
  }
  return undefined;
}

export function createHeadlessGame(
  options: HeadlessGameOptions = {}
): HeadlessGameContext {
  if (options.ctx) return options.ctx;

  const restored = options.matchSave
    ? restoreMatchSave(options.matchSave)
    : null;
  const { rngState, matchStatsState, seed } = savedInputs(options, restored);
  const teams = matchTeams(options, restored);

  const eventBus = new EventBus();
  const matchStats = new MatchStats(
    eventBus,
    teams,
    matchStatsState?.progressionEnabled ?? options.progressionEnabled
  );
  if (matchStatsState) {
    matchStats.restoreState(matchStatsState);
  }
  const rng = new RNGService(seed);
  if (rngState) rng.restoreState(rngState);
  const blockResolutionService = new BlockResolutionService(rng);

  const initialState = startingState(options, restored, teams);

  const gameService = new GameService({ eventBus: eventBus, teams: teams, rngService: rng, blockResolutionService: blockResolutionService, ...(initialState !== undefined && { initialState: initialState }), delay: options.delay ?? noDelay }
  );
  if (options.knockout) gameService.getState().knockout = true;
  if (options.paysWinnings) gameService.getState().paysWinnings = true;
  if (options.competition) gameService.getState().competition = true;
  const turnManagerState = savedTurnManager(options, restored);
  if (turnManagerState) {
    gameService.restoreTurnManagerState(turnManagerState);
  }

  return { eventBus, gameService, rng, teams, seed, matchStats };
}
