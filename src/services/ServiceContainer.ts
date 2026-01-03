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

import { RNGService, IRNGService } from "./rng/RNGService.js";
import { BlockResolutionService } from "./BlockResolutionService.js";

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  public readonly eventBus: IEventBus;
  public readonly gameService: IGameService;
  public readonly soundManager: SoundManager;
  public readonly rngService: IRNGService;
  public readonly blockResolutionService: BlockResolutionService;

  private constructor(
    eventBus: IEventBus,
    team1: Team,
    team2: Team,
    initialState?: GameState
  ) {
    // Use shared EventBus
    this.eventBus = eventBus;

    // Create Services
    this.soundManager = new SoundManager();

    // Deterministic RNG initialization
    const seed = Date.now();
    this.rngService = new RNGService(seed);
    this.blockResolutionService = new BlockResolutionService(this.rngService);

    this.gameService = new GameService(
      this.eventBus,
      team1,
      team2,
      this.rngService,
      this.blockResolutionService,
      initialState
    );
  }

  /**
   * Initialize the service container with teams
   * Must be called before getInstance()
   */
  static initialize(
    eventBus: IEventBus,
    team1: Team,
    team2: Team,
    initialState?: GameState
  ): ServiceContainer {
    ServiceContainer.instance = new ServiceContainer(
      eventBus,
      team1,
      team2,
      initialState
    );
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
    ServiceContainer.instance = null;
  }
}
