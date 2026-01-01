import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { IEventBus } from "../../services/EventBus";
import { GamePhase, SubPhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { PhaseHandler } from "./handlers/PhaseHandler";
import { SetupPhaseHandler } from "./handlers/SetupPhaseHandler";
import { PlayPhaseHandler } from "./handlers/PlayPhaseHandler";
import { KickoffPhaseHandler } from "./handlers/KickoffPhaseHandler";

/**
 * SceneOrchestrator - Manages Phase Transitions and Delegates Logic
 *
 * Responsibility:
 * - Listen for Global Phase Changes.
 * - Load/Unload the appropriate PhaseHandler.
 * - Manage High-Level Scene Lifecycles.
 *
 * DOES NOT:
 * - Implement specific phase logic (Placement, Passing, etc.) -> Delegated to Handler.
 */

interface SceneOrchestratorConfig {
  skipCoinFlip?: boolean;
  startingPhase?: GamePhase;
  startingSubPhase?: SubPhase;
}

export class SceneOrchestrator {
  private currentHandler: PhaseHandler | null = null;
  private eventHandlers: Map<string, (data?: any) => void> = new Map();

  constructor(
    private scene: GameScene,
    private gameService: IGameService,
    private eventBus: IEventBus,
    private config: SceneOrchestratorConfig = {}
  ) {
    this.setupGlobalListeners();
  }

  private setupGlobalListeners(): void {
    // Phase Change Listener (Always Active)
    const onPhaseChanged = (data: {
      phase: GamePhase;
      subPhase?: SubPhase;
    }) => {
      this.handlePhaseChange(data.phase, data.subPhase);
    };
    this.eventBus.on(GameEventNames.PhaseChanged, onPhaseChanged);
    this.eventHandlers.set(GameEventNames.PhaseChanged, onPhaseChanged);
  }

  public initialize(): void {
    const state = this.gameService.getState();

    // Determine starting phase
    let phase = state.phase;
    let subPhase = state.subPhase;

    if (this.config.startingPhase) {
      phase = this.config.startingPhase;
      subPhase = this.config.startingSubPhase;
    } else if (phase === undefined) {
      phase = GamePhase.SETUP; // Default
    }

    this.handlePhaseChange(phase, subPhase);
  }

  private handlePhaseChange(phase: GamePhase, subPhase?: SubPhase): void {
    console.log(`[Orchestrator] Switching to Phase: ${phase}`);

    // 1. Exit current phase
    if (this.currentHandler) {
      this.currentHandler.exit();
      this.currentHandler = null;
    }

    // 2. Instantiate new handler
    switch (phase) {
      case GamePhase.SETUP:
        this.currentHandler = new SetupPhaseHandler(
          this.scene,
          this.gameService,
          this.eventBus
        );
        break;
      case GamePhase.PLAY:
        this.currentHandler = new PlayPhaseHandler(
          this.scene,
          this.gameService,
          this.eventBus
        );
        break;
      case GamePhase.KICKOFF:
        this.currentHandler = new KickoffPhaseHandler(
          this.scene,
          this.gameService,
          this.eventBus
        );
        break;
      case GamePhase.SANDBOX_IDLE:
        console.log(
          "[Orchestrator] Game in Idle Mode. Waiting for Scenario..."
        );
        this.currentHandler = null;
        break;
      default:
        console.warn(`[Orchestrator] No handler for phase: ${phase}`);
        break;
    }

    // 3. Enter new phase
    if (this.currentHandler) {
      this.currentHandler.enter();
    }

    // Legacy mapping for direct control if needed
    if (phase === GamePhase.SETUP) {
      if (subPhase === SubPhase.SETUP_KICKING) {
        this.startPlacement(SubPhase.SETUP_KICKING);
      } else if (subPhase === SubPhase.SETUP_RECEIVING) {
        this.startPlacement(SubPhase.SETUP_RECEIVING);
      } else if (subPhase === SubPhase.COIN_FLIP) {
        this.startSetupPhase();
      }
    }
  }

  /**
   * Start placement - Exposed for Scene/Tests to manually trigger if needed
   * (Though ideally this is triggered by Phase Events now)
   */
  public startPlacement(subPhase: SubPhase): void {
    // Delegate to scene directly if handler doesn't cover it?
    // Or move this logic INTO SetupPhaseHandler entirely?
    // For backward compatibility, we can keep using Scene methods for now
    // but managed by the handler?

    // Let's call the Scene methods directly as the 'Handler' would.
    const isKicking = subPhase === SubPhase.SETUP_KICKING;
    const activeTeam = isKicking
      ? this.scene.kickingTeam
      : this.scene.receivingTeam;
    if (!activeTeam) return;

    const isTeam1 = activeTeam.id === this.scene.team1.id;

    this.eventBus.emit(GameEventNames.UI_ShowSetupControls, {
      subPhase,
      activeTeam,
    });

    this.scene.highlightSetupZone(isTeam1);
    this.scene.enablePlacement(activeTeam, isTeam1);
  }

  public startSetupPhase(): void {
    this.scene.startSetupPhase();
  }

  public checkSetupCompleteness(): void {
    // Helper proxy
    if (!this.scene.isSetupActive) return;
    const state = this.gameService.getState();
    if (!state.activeTeamId) return;
    const isComplete = this.gameService.isSetupComplete(state.activeTeamId);
    this.eventBus.emit(GameEventNames.UI_SetupComplete, isComplete);
  }

  public setupEventListeners(): void {
    // Deprecated - kept empty for interface compatibility if any
  }

  public destroy(): void {
    if (this.currentHandler) {
      this.currentHandler.exit();
    }
    this.eventHandlers.forEach((handler, event) => {
      this.eventBus.off(event, handler);
    });
    this.eventHandlers.clear();
  }
}
