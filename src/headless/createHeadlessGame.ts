/**
 * createHeadlessGame - Bootstrap a complete game engine in plain Node.
 *
 * No Phaser, no DOM, no ServiceContainer singleton: every call returns an
 * independent game so multiple games can run in one process (tests, AI
 * self-play). All pacing delays resolve immediately via the noDelay provider.
 */

import { EventBus, IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { RNGService, IRNGService, RNGState } from "../services/rng/RNGService";
import { BlockResolutionService } from "../services/BlockResolutionService";
import { applyScenario } from "../game/applyScenario";
import { noDelay } from "../game/core/GameFlowManager";
import { TeamFactory } from "../game/TeamFactory";
import { Team, RosterName } from "../types/Team";
import { GameState, GamePhase, SubPhase } from "../types/GameState";
import { Scenario } from "../types/Scenario";
import { MatchStats, MatchStatsSnapshot } from "../game/progression/MatchStats";
import { MatchSave, restoreMatchSave } from "./serialization";
import { TurnManagerState } from "../game/managers/TurnManager";

export interface HeadlessGameOptions {
  /**
   * Adopt an already-running engine (e.g. the browser's ServiceContainer)
   * instead of constructing one — used by online play, where HeadlessGame
   * executes the remote coach's protocol commands against the live game.
   * When set, every other option is ignored.
   */
  ctx?: HeadlessGameContext;
  /**
   * Start play automatically on the ReadyToStart signal (default true).
   * The browser passes false: KickoffPhaseHandler already does this.
   */
  autoStartOnReady?: boolean;
  /** Provide teams, or omit to get two generated default teams */
  team1?: Team;
  team2?: Team;
  /** RNG seed; defaults to Date.now(). Same seed + same commands = same game. */
  seed?: number;
  /** Start from a scenario definition (placements, phase, ball). Scenario seed is used unless `seed` is set. */
  scenario?: Scenario;
  /** Resume from an explicit state (e.g. a deserialized snapshot). Takes precedence over scenario/startingPhase. */
  initialState?: GameState;
  /** Start phase when no scenario given (defaults to SETUP for a full match) */
  startingPhase?: GamePhase;
  startingSubPhase?: SubPhase;
  /** Roster used for generated default teams */
  defaultRoster?: RosterName;
  /** League fixture progression; friendlies default to false. */
  progressionEnabled?: boolean;
  /** Exact running RNG state when restoring a saved match. */
  rngState?: RNGState;
  /** Accumulated statistics when restoring a saved match. */
  matchStatsState?: MatchStatsSnapshot;
  /** Turn counters and drive lifecycle state when restoring a saved match. */
  turnManagerState?: TurnManagerState;
  /** Restore every cold-start dependency from a persisted match payload. */
  matchSave?: MatchSave;
}

export interface HeadlessGameContext {
  eventBus: IEventBus;
  gameService: GameService;
  rng: IRNGService;
  team1: Team;
  team2: Team;
  seed: number;
  matchStats: MatchStats;
}

/**
 * Generated team/player ids embed Date.now(), which breaks recorded command
 * scripts and cross-run comparisons. Headless default teams get stable ids
 * (team1-player-3 etc.) so the same script replays on any machine.
 */
function stabilizeIds(team: Team, stableId: string): Team {
  team.id = stableId;
  team.players.forEach((p) => {
    p.teamId = stableId;
    p.id = `${stableId}-player-${p.number}`;
  });
  return team;
}

export function createHeadlessGame(
  options: HeadlessGameOptions = {}
): HeadlessGameContext {
  if (options.ctx) return options.ctx;

  const restored = options.matchSave
    ? restoreMatchSave(options.matchSave)
    : null;
  const rngState = restored?.save.rng ?? options.rngState;
  const matchStatsState = restored?.save.matchStats ?? options.matchStatsState;
  const seed =
    rngState?.initialSeed ??
    options.seed ??
    options.scenario?.seed ??
    Date.now();

  // A scenario may pin specific rosters (as the browser sandbox does);
  // explicit options still win over the scenario's choice
  const roster = options.defaultRoster ?? RosterName.HUMAN;
  const team1Roster = options.scenario?.setup.team1Roster ?? roster;
  const team2Roster = options.scenario?.setup.team2Roster ?? roster;
  const team1 =
    restored?.teams[0] ??
    options.team1 ??
    stabilizeIds(
      TeamFactory.createTestTeam(team1Roster, "Home Team", 0xcc0000),
      "team1"
    );
  const team2 =
    restored?.teams[1] ??
    options.team2 ??
    stabilizeIds(
      TeamFactory.createTestTeam(team2Roster, "Away Team", 0x0000cc),
      "team2"
    );

  const eventBus = new EventBus();
  const matchStats = new MatchStats(
    eventBus,
    [team1, team2],
    matchStatsState?.progressionEnabled ?? options.progressionEnabled
  );
  if (matchStatsState) {
    matchStats.restoreState(matchStatsState);
  }
  const rng = new RNGService(seed);
  if (rngState) rng.restoreState(rngState);
  const blockResolutionService = new BlockResolutionService(rng);

  let initialState: GameState | undefined =
    restored?.state ?? options.initialState;
  if (options.scenario && !initialState) {
    initialState = applyScenario(options.scenario, team1, team2);
  } else if (options.startingPhase) {
    initialState = GameService.createInitialState(
      team1,
      team2,
      options.startingPhase,
      options.startingSubPhase
    );
  }

  const gameService = new GameService(
    eventBus,
    team1,
    team2,
    rng,
    blockResolutionService,
    initialState,
    noDelay
  );
  const turnManagerState =
    restored?.save.turnManager ?? options.turnManagerState;
  if (turnManagerState) {
    gameService.restoreTurnManagerState(turnManagerState);
  }

  return { eventBus, gameService, rng, team1, team2, seed, matchStats };
}
