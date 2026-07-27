/**
 * ServiceContainer - Dependency Injection Container
 *
 * Manages service instances and provides access to them throughout the application.
 * Uses singleton pattern to ensure single source of truth for game state.
 */

import { IEventBus } from "./EventBus.js";
import { GameService } from "./GameService.js";
import { IGameService } from "./interfaces/IGameService.js";
import { SoundManager } from "./SoundManager.js";
import { Team } from "@/types/Team";
import { GameState } from "@/types/GameState";

import { RNGService, IRNGService, RNGState } from "./rng/RNGService.js";
import { BlockResolutionService } from "./BlockResolutionService.js";
import {
  MatchStats,
  MatchStatsSnapshot,
} from "../game/progression/MatchStats.js";
import { TurnManagerState } from "../game/managers/TurnManager.js";
import {
  installBrowserTestBridge,
  uninstallBrowserTestBridge,
} from "../testing/browserBridge.js";

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  public readonly eventBus: IEventBus;
  public readonly gameService: IGameService;
  public readonly soundManager: SoundManager;
  public readonly rngService: IRNGService;
  public readonly blockResolutionService: BlockResolutionService;
  public readonly matchStats: MatchStats;

  private constructor(
    eventBus: IEventBus,
    team1: Team,
    team2: Team,
    initialState?: GameState,
    seed?: number,
    gameServiceFactory?: (inner: GameService) => IGameService,
    progressionEnabled = false,
    rngState?: RNGState,
    matchStatsState?: MatchStatsSnapshot,
    turnManagerState?: TurnManagerState
  ) {
    // Use shared EventBus
    this.eventBus = eventBus;

    // Create Services
    this.soundManager = new SoundManager();

    // Deterministic RNG initialization
    // Use provided seed if available, otherwise use timestamp
    const rngSeed =
      rngState?.initialSeed ?? (seed !== undefined ? seed : Date.now());
    console.log(`[ServiceContainer] Initializing RNG with seed: ${rngSeed}`);
    this.rngService = new RNGService(rngSeed);
    if (rngState) this.rngService.restoreState(rngState);
    this.blockResolutionService = new BlockResolutionService(this.rngService);
    this.matchStats = new MatchStats(
      this.eventBus,
      [team1, team2],
      matchStatsState?.progressionEnabled ?? progressionEnabled
    );
    if (matchStatsState) this.matchStats.restoreState(matchStatsState);

    const gameService = new GameService(
      this.eventBus,
      team1,
      team2,
      this.rngService,
      this.blockResolutionService,
      initialState
    );
    if (turnManagerState) {
      gameService.restoreTurnManagerState(turnManagerState);
    }
    // Online guests wrap the local engine in a network proxy: the inner
    // service becomes a passive, snapshot-synced replica the UI reads from,
    // while all mutations travel to the host (see NetworkedGameService).
    this.gameService = gameServiceFactory
      ? gameServiceFactory(gameService)
      : gameService;
  }

  /**
   * Initialize the service container with teams
   * Must be called before getInstance()
   * @param seed Optional RNG seed for deterministic outcomes (used in scenarios)
   */
  static initialize(
    eventBus: IEventBus,
    team1: Team,
    team2: Team,
    initialState?: GameState,
    seed?: number,
    gameServiceFactory?: (inner: GameService) => IGameService,
    progressionEnabled = false,
    rngState?: RNGState,
    matchStatsState?: MatchStatsSnapshot,
    turnManagerState?: TurnManagerState
  ): ServiceContainer {
    ServiceContainer.instance = new ServiceContainer(
      eventBus,
      team1,
      team2,
      initialState,
      seed,
      gameServiceFactory,
      progressionEnabled,
      rngState,
      matchStatsState,
      turnManagerState
    );
    // Development/test builds only — the installer compiles away in a
    // production build, so this is a no-op there. It must run here, at the
    // moment the engine exists, so the observer sees the whole match log.
    installBrowserTestBridge({
      eventBus: ServiceContainer.instance.eventBus,
      gameService: ServiceContainer.instance.gameService as GameService,
      rng: ServiceContainer.instance.rngService,
      team1,
      team2,
      seed: seed ?? 0,
      matchStats: ServiceContainer.instance.matchStats,
    });
    return ServiceContainer.instance;
  }

  /**
   * Get the singleton instance
   * Throws error if not initialized
   */
  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      throw new Error(
        "ServiceContainer not initialized. Call initialize() first."
      );
    }
    return ServiceContainer.instance;
  }

  /**
   * Check if container is initialized
   */
  static isInitialized(): boolean {
    return ServiceContainer.instance !== null;
  }

  /**
   * Reset the container (useful for testing)
   */
  static reset(): void {
    uninstallBrowserTestBridge();
    ServiceContainer.instance = null;
  }
}
