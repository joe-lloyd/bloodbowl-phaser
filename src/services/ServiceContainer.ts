import { type IEventBus } from "./EventBus.js";
import { GameService } from "./GameService.js";
import { type IGameService } from "./interfaces/IGameService.js";
import { type SeatedTeams } from "@/game/seating";
import { type GameState } from "@/types/GameState";

import {
  RNGService,
  type IRNGService,
  type RNGState,
} from "./rng/RNGService.js";
import { BlockResolutionService } from "./BlockResolutionService.js";
import {
  MatchStats,
  type MatchStatsSnapshot,
} from "../game/progression/MatchStats.js";
import { type TurnManagerState } from "../game/managers/TurnManager.js";
import {
  installBrowserTestBridge,
  uninstallBrowserTestBridge,
} from "../testing/browserBridge.js";

interface ServiceContainerOptions {
  eventBus: IEventBus;
  teams: SeatedTeams;
  initialState?: GameState;
  seed?: number;
  gameServiceFactory?: (inner: GameService) => IGameService;
  progressionEnabled?: boolean;
  rngState?: RNGState;
  matchStatsState?: MatchStatsSnapshot;
  turnManagerState?: TurnManagerState;
}

function createRng(options: ServiceContainerOptions): IRNGService {
  const rngSeed = options.rngState?.initialSeed ?? options.seed ?? Date.now();
  console.log(`[ServiceContainer] Initializing RNG with seed: ${String(rngSeed)}`);
  const rng = new RNGService(rngSeed);
  if (options.rngState) rng.restoreState(options.rngState);
  return rng;
}

export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  public readonly eventBus: IEventBus;
  public readonly gameService: IGameService;
  public readonly engineGameService: GameService;
  public readonly rngService: IRNGService;
  public readonly blockResolutionService: BlockResolutionService;
  public readonly matchStats: MatchStats;

  private constructor(options: ServiceContainerOptions) {
    const { eventBus, teams, initialState, gameServiceFactory,
      progressionEnabled = false, matchStatsState, turnManagerState } = options;
    this.eventBus = eventBus;

    this.rngService = createRng(options);
    this.blockResolutionService = new BlockResolutionService(this.rngService);
    this.matchStats = new MatchStats(
      this.eventBus,
      teams,
      matchStatsState?.progressionEnabled ?? progressionEnabled
    );
    if (matchStatsState) this.matchStats.restoreState(matchStatsState);

    const gameService = new GameService({
      eventBus: this.eventBus, teams, rngService: this.rngService,
      blockResolutionService: this.blockResolutionService,
      ...(initialState !== undefined && { initialState }),
    });
    this.engineGameService = gameService;
    if (turnManagerState) {
      gameService.restoreTurnManagerState(turnManagerState);
    }

    this.gameService = gameServiceFactory
      ? gameServiceFactory(gameService)
      : gameService;
  }

  static initialize(options: ServiceContainerOptions): ServiceContainer {
    const { teams, seed = 0 } = options;
    const instance = new ServiceContainer(options);
    this.instance = instance;

    installBrowserTestBridge({
      eventBus: instance.eventBus,
      gameService: instance.engineGameService,
      rng: instance.rngService,
      teams,
      seed,
      matchStats: instance.matchStats,
    });
    return instance;
  }

  static getInstance(): ServiceContainer {
    if (!this.instance) {
      throw new Error(
        "ServiceContainer not initialized. Call initialize() first."
      );
    }
    return this.instance;
  }

  static isInitialized(): boolean {
    return this.instance !== null;
  }

  static reset(): void {
    uninstallBrowserTestBridge();
    ServiceContainer.instance = null;
  }
}
