import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { IEventBus } from "../../services/EventBus";
import { GamePhase, SubPhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { PhaseHandler } from "./handlers/PhaseHandler";
import { SetupPhaseHandler } from "./handlers/SetupPhaseHandler";
import { PlayPhaseHandler } from "./handlers/PlayPhaseHandler";
import { KickoffPhaseHandler } from "./handlers/KickoffPhaseHandler";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";

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
  private currentPhase: GamePhase | null = null;
  private eventHandlers: Map<
    keyof import("../../types/events").AllEvents,
    (data?: unknown) => void
  > = new Map();

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
    // 2. Instantiate new handler ONLY if phase actually changed
    if (!this.currentHandler || this.currentPhase !== phase) {
      this.currentPhase = phase;

      // Exit current phase
      if (this.currentHandler) {
        this.currentHandler.exit();
        this.currentHandler = null;
      }

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
          this.scene.startKickoffPhase(subPhase);
          break;
        case GamePhase.SANDBOX_IDLE:
          console.log(
            "[Orchestrator] Game in Idle Mode. Waiting for Scenario..."
          );
          this.currentHandler = null;
          break;
        case GamePhase.GAME_OVER:
          // The match has ended. There is no active handler; resolve to the
          // completed state and surface the final result to the HUD instead
          // of falling through to the unhandled-phase warning.
          this.currentHandler = null;
          this.resolveMatchComplete();
          break;
        default:
          console.warn(`[Orchestrator] No handler for phase: ${phase}`);
          break;
      }
    }

    // 3. Enter new phase
    if (this.currentHandler && !(this.currentHandler as any).isEntered) {
      this.currentHandler.enter();
      (this.currentHandler as any).isEntered = true;
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
    // Derive the active team from live game state — scene.kickingTeam is
    // only the coin-flip result and goes stale once later drives swap the
    // kicking team (scorer kicks, halves swap).
    const isKicking = subPhase === SubPhase.SETUP_KICKING;
    const activeTeamId = this.gameService.getActiveTeamId();
    const activeTeam =
      activeTeamId === this.scene.team1.id
        ? this.scene.team1
        : activeTeamId === this.scene.team2.id
          ? this.scene.team2
          : null;
    if (!activeTeam) return;

    // Keep the scene's drive bookkeeping current for downstream users
    // (KickoffPhaseHandler reads scene.kickingTeam at kickoff)
    if (isKicking) {
      const otherTeam =
        activeTeam.id === this.scene.team1.id
          ? this.scene.team2
          : this.scene.team1;
      this.scene.kickingTeam = activeTeam;
      this.scene.receivingTeam = otherTeam;
    }

    const isTeam1 = activeTeam.id === this.scene.team1.id;

    // Online: only the active team's coach interacts with placement; the
    // opponent watches the board update read-only (UI_SyncBoard renders it)
    // with the setup panel hidden and no drag.
    const match = getActiveOnlineMatch();
    if (match && activeTeam.id !== match.myTeamId) {
      this.eventBus.emit(GameEventNames.UI_HideSetupControls);
      this.scene.disableSetupInteraction();
      this.eventBus.emit(GameEventNames.UI_SyncBoard);
      return;
    }

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

  /**
   * The match has reached GAME_OVER. Compute the final score/winner from live
   * state and surface it to the HUD. The React layer already renders the
   * post-match screen off the phase change; this announcement makes the
   * result explicit rather than leaving the game to stall silently.
   */
  private resolveMatchComplete(): void {
    const team1 = this.scene.team1;
    const team2 = this.scene.team2;
    const score1 = this.gameService.getScore(team1.id);
    const score2 = this.gameService.getScore(team2.id);
    const result =
      score1 === score2
        ? `Full time — ${team1.name} ${score1} : ${score2} ${team2.name} (draw)`
        : score1 > score2
          ? `Full time — ${team1.name} win ${score1} : ${score2}`
          : `Full time — ${team2.name} win ${score2} : ${score1}`;
    console.log(`[Orchestrator] Match complete. ${result}`);
    this.eventBus.emit(GameEventNames.UI_Notification, result);
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
      this.eventBus.off(event, handler as any);
    });
    this.eventHandlers.clear();
  }
}
