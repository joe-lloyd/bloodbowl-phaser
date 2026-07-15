/**
 * createHeadlessGame - Bootstrap a complete game engine in plain Node.
 *
 * No Phaser, no DOM, no ServiceContainer singleton: every call returns an
 * independent game so multiple games can run in one process (tests, AI
 * self-play). All pacing delays resolve immediately via the noDelay provider.
 */

import { EventBus, IEventBus } from "../services/EventBus";
import { GameService } from "../services/GameService";
import { RNGService, IRNGService } from "../services/rng/RNGService";
import { BlockResolutionService } from "../services/BlockResolutionService";
import { applyScenario } from "../game/applyScenario";
import { noDelay } from "../game/core/GameFlowManager";
import { TeamFactory } from "../game/TeamFactory";
import { Team, RosterName } from "../types/Team";
import { GameState, GamePhase, SubPhase } from "../types/GameState";
import { Scenario } from "../types/Scenario";

export interface HeadlessGameOptions {
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
}

export interface HeadlessGameContext {
  eventBus: IEventBus;
  gameService: GameService;
  rng: IRNGService;
  team1: Team;
  team2: Team;
  seed: number;
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
  const seed = options.seed ?? options.scenario?.seed ?? Date.now();

  // A scenario may pin specific rosters (as the browser sandbox does);
  // explicit options still win over the scenario's choice
  const roster = options.defaultRoster ?? RosterName.HUMAN;
  const team1Roster = options.scenario?.setup.team1Roster ?? roster;
  const team2Roster = options.scenario?.setup.team2Roster ?? roster;
  const team1 =
    options.team1 ??
    stabilizeIds(
      TeamFactory.createTestTeam(team1Roster, "Home Team", 0xcc0000),
      "team1"
    );
  const team2 =
    options.team2 ??
    stabilizeIds(
      TeamFactory.createTestTeam(team2Roster, "Away Team", 0x0000cc),
      "team2"
    );

  const eventBus = new EventBus();
  const rng = new RNGService(seed);
  const blockResolutionService = new BlockResolutionService(rng);

  let initialState: GameState | undefined = options.initialState;
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

  return { eventBus, gameService, rng, team1, team2, seed };
}
