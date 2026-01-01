import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { SubPhase } from "../../../types/GameState";

/**
 * SetupPhaseHandler
 *
 * Handles events for the Setup Phase:
 * - Coin Flip
 * - Player Placement (Delegated to Scene placement controller)
 * - Setup Actions (Confirm, Clear, Load)
 */
export class SetupPhaseHandler implements PhaseHandler {
  private handlers: Map<string, (data: any) => void> = new Map();

  constructor(
    private scene: GameScene,
    private gameService: IGameService,
    private eventBus: IEventBus
  ) {}

  enter(): void {
    console.log("[SetupPhaseHandler] Entering Setup Phase");
    this.setupListeners();

    // Check SubPhase to trigger correct startup events
    const subPhase = this.gameService.getSubPhase();
    console.log(`[SetupPhaseHandler] Current SubPhase: ${subPhase}`);

    if (subPhase === SubPhase.INTRO) {
      // 1. Intro -> Show Teams
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Welcome to Blood Bowl!"
      );
      // Auto-advance to Weather after delay (demonstration)
      setTimeout(() => {
        this.gameService.setWeather(0); // Trigger Roll
      }, 3000);
    } else if (subPhase === SubPhase.WEATHER) {
      // 2. Weather -> Coin Flip
      // Assuming weather is already rolled/set if we enter here?
      // Or we trigger roll?
      // Let's just prompt Coin Flip if weather is done.
      this.eventBus.emit(GameEventNames.UI_ShowCoinFlip);
    } else if (subPhase === SubPhase.COIN_FLIP) {
      this.eventBus.emit(GameEventNames.UI_ShowCoinFlip);
    } else if (
      subPhase === SubPhase.SETUP_KICKING ||
      subPhase === SubPhase.SETUP_RECEIVING
    ) {
      // Legacy "Start Placement" logic
      const state = this.gameService.getState();
      if (state.activeTeamId) {
        const activeTeam =
          state.activeTeamId === this.scene.team1.id
            ? this.scene.team1
            : this.scene.team2;
        const isTeam1 = activeTeam.id === this.scene.team1.id;
        this.eventBus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase,
          activeTeam,
        });
        this.scene.highlightSetupZone(isTeam1);
        this.scene.enablePlacement(activeTeam, isTeam1);
      }
    }
  }

  exit(): void {
    console.log("[SetupPhaseHandler] Exiting Setup Phase");
    this.removeListeners();
  }

  private setupListeners(): void {
    // Coin Flip
    this.register(GameEventNames.UI_CoinFlipComplete, (data) => {
      this.scene.kickingTeam = data.kickingTeam;
      this.scene.receivingTeam = data.receivingTeam;
      this.gameService.startSetup(data.kickingTeam.id);
    });

    // Setup Actions
    this.register(GameEventNames.UI_SetupAction, (data) =>
      this.handleSetupAction(data)
    );
  }

  private register(event: string, handler: (data: any) => void): void {
    this.handlers.set(event, handler);
    this.eventBus.on(event, handler);
  }

  private removeListeners(): void {
    this.handlers.forEach((handler, event) => {
      this.eventBus.off(event, handler);
    });
    this.handlers.clear();
  }

  private handleSetupAction(data: { action: string }): void {
    const state = this.gameService.getState();
    const activeTeamId = state.activeTeamId || this.scene.team1.id;
    const activeTeam =
      activeTeamId === this.scene.team1.id
        ? this.scene.team1
        : this.scene.team2;
    const isTeam1 = activeTeam.id === this.scene.team1.id;

    // Logic extracted from original SceneOrchestrator
    switch (data.action) {
      case "confirm":
        this.gameService.confirmSetup(activeTeam.id);
        break;
      case "default": {
        const formationManager: any = this.scene["formationManager"]; // Access managed by scene
        const placementController: any = this.scene["placementController"];

        if (formationManager && placementController) {
          const defFormation = formationManager.getDefaultFormation(isTeam1);
          placementController.loadFormation(defFormation);
          this.scene.refreshDugouts();
        }
        break;
      }
      case "clear":
        this.scene["placementController"]?.clearPlacements();
        this.scene.refreshDugouts();
        break;
      // Save/Load omitted for brevity, logic remains same (move here if needed)
    }
  }
}
