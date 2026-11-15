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
  /**
   * Build a command response's snapshot only if it is read. For throwaway
   * copies of a game, such as a lookahead's playouts.
   */
  lazySnapshots?: boolean;
  /** Start phase when no scenario given (defaults to SETUP for a full match) */
  startingPhase?: GamePhase;
  startingSubPhase?: SubPhase;
  /** Roster used for generated default teams */
  defaultRoster?: RosterName;
  /** League fixture progression; friendlies default to false. */
  progressionEnabled?: boolean;
  /** A knockout tie: a draw goes to Extra Time, then Penalties. */
  knockout?: boolean;
  /** A league fixture (one that pays winnings): kick-off takes on
   *  Journeymen and full time rolls the Fan Factors. */
  paysWinnings?: boolean;
  /** Exact running RNG state when restoring a saved match. */
  rngState?: RNGState;
  /** Accumulated statistics when restoring a saved match. */
  matchStatsState?: MatchStatsSnapshot;
  /** Turn counters and drive lifecycle state when restoring a saved match. */
  turnManagerState?: TurnManagerState;
  /** Restore every cold-start dependency from a persisted match payload. */
  matchSave?: MatchSave;
  /** The current drive's kicking team, for a match resumed mid-drive. */
  kickingTeamId?: string | null;
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
export function stabilizeIds(team: Team, stableId: string): Team {
  team.id = stableId;
  team.players.forEach((p) => {
    p.teamId = stableId;
    p.id = `${stableId}-player-${p.number}`;
  });
  return team;
}

type RestoredSave = ReturnType<typeof restoreMatchSave> | null;

/**
 * The two teams: a saved match's, the caller's, or default test teams. A
 * scenario may pin specific rosters (as the browser sandbox does);
 * explicit options still win over the scenario's choice.
 */
function matchTeams(
  options: HeadlessGameOptions,
  restored: RestoredSave
): { team1: Team; team2: Team } {
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
  return { team1, team2 };
}

/** The RNG and statistics to resume, a save's first, and the seed. */
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

const savedTurnManager = (
  options: HeadlessGameOptions,
  restored: RestoredSave
) => restored?.save.turnManager ?? options.turnManagerState;

/** The state the engine starts from; undefined lets it ready a fresh game. */
function startingState(
  options: HeadlessGameOptions,
  restored: RestoredSave,
  team1: Team,
  team2: Team
): GameState | undefined {
  const initialState: GameState | undefined =
    restored?.state ?? options.initialState;
  if (initialState) return initialState;
  if (options.scenario) return applyScenario(options.scenario, team1, team2);
  if (options.startingPhase) {
    return GameService.createMatchState(
      team1,
      team2,
      options.startingPhase,
      options.startingSubPhase,
      { paysWinnings: options.paysWinnings }
    );
  }
  if (options.paysWinnings) {
    // As the engine readies a fresh game itself, but for a league fixture
    return GameService.createMatchState(
      team1,
      team2,
      GamePhase.SANDBOX_IDLE,
      undefined,
      { paysWinnings: true }
    );
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
  const { team1, team2 } = matchTeams(options, restored);

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

  const initialState = startingState(options, restored, team1, team2);

  const gameService = new GameService(
    eventBus,
    team1,
    team2,
    rng,
    blockResolutionService,
    initialState,
    noDelay
  );
  if (options.knockout) gameService.getState().knockout = true;
  if (options.paysWinnings) gameService.getState().paysWinnings = true;
  const turnManagerState = savedTurnManager(options, restored);
  if (turnManagerState) {
    gameService.restoreTurnManagerState(turnManagerState);
  }

  return { eventBus, gameService, rng, team1, team2, seed, matchStats };
}
