import type { OrchestratorService } from "./handlers/servicePorts";
import type { OrchestratorScene } from "./handlers/scenePorts";
import { showSetupPlacement } from "./handlers/setupPlacement";
import { type IEventBus } from "../../services/EventBus";
import { GamePhase, SubPhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";
import { type PhaseHandler } from "./handlers/PhaseHandler";
import { SetupPhaseHandler } from "./handlers/SetupPhaseHandler";
import { PlayPhaseHandler } from "./handlers/PlayPhaseHandler";
import { KickoffPhaseHandler } from "./handlers/KickoffPhaseHandler";
import { TouchdownPhaseHandler } from "./handlers/TouchdownPhaseHandler";

interface SceneOrchestratorConfig {
  skipCoinFlip?: boolean;
  startingPhase?: GamePhase;
  startingSubPhase?: SubPhase;
}

export class SceneOrchestrator {
  private currentHandler: PhaseHandler | null = null;
  private enteredHandler: PhaseHandler | null = null;
  private currentPhase: GamePhase | null = null;

  private scene: OrchestratorScene;
  private gameService: OrchestratorService;
  private eventBus: IEventBus;
  private config: SceneOrchestratorConfig;
  constructor(
{ scene,gameService,eventBus,config={} }: { scene: OrchestratorScene; gameService: OrchestratorService; eventBus: IEventBus; config?: SceneOrchestratorConfig; }  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
    this.config = config;
    this.setupGlobalListeners();
  }

  private onPhaseChanged = (data: {
    phase: GamePhase;
    subPhase?: SubPhase;
  }) => {
    this.handlePhaseChange(data.phase, data.subPhase);
  };

  private setupGlobalListeners(): void {
    this.eventBus.on(GameEventNames.PhaseChanged, this.onPhaseChanged);
  }

  public initialize(): void {
    const state = this.gameService.getState();

    const phase = this.config.startingPhase ?? state.phase;
    const subPhase = this.config.startingPhase ? this.config.startingSubPhase : state.subPhase;

    this.handlePhaseChange(phase, subPhase);
  }

  private handlePhaseChange(phase: GamePhase, subPhase?: SubPhase): void {
    if (!this.currentHandler || this.currentPhase !== phase) {
      this.currentPhase = phase;

      if (this.currentHandler) {
        this.currentHandler.exit();
        this.currentHandler = null;
      }

      this.installHandler(phase, subPhase);
    }

    if (this.currentHandler && this.enteredHandler !== this.currentHandler) {
      this.currentHandler.enter();
      this.enteredHandler = this.currentHandler;
    }

    this.applySetupSubPhase(phase, subPhase);
  }

  private applySetupSubPhase(phase: GamePhase, subPhase?: SubPhase): void {
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

  private installHandler(phase: GamePhase, subPhase?: SubPhase): void {
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
        case GamePhase.HALFTIME:
        case GamePhase.TOUCHDOWN:
          this.currentHandler = new TouchdownPhaseHandler(
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
        case GamePhase.GAME_OVER:
          this.currentHandler = null;
          console.log("[Orchestrator] Match complete.");
          break;
        default:
          console.warn(`[Orchestrator] No handler for phase: ${String(phase)}`);
          break;
      }
  }

  public startPlacement(subPhase: SubPhase): void {
    const isKicking = subPhase === SubPhase.SETUP_KICKING;
    const activeTeamId = this.gameService.getActiveTeamId();
    const activeTeam = [this.scene.team1, this.scene.team2].find((team) => team.id === activeTeamId);
    if (!activeTeam) return;

    if (isKicking) {
      const otherTeam =
        activeTeam.id === this.scene.team1.id
          ? this.scene.team2
          : this.scene.team1;
      this.scene.kickingTeam = activeTeam;
      this.scene.receivingTeam = otherTeam;
    }

    showSetupPlacement({ scene: this.scene, gameService: this.gameService, eventBus: this.eventBus }, { subPhase, team: activeTeam });
  }

  public startSetupPhase(): void {
    this.scene.startSetupPhase();
  }

  public checkSetupCompleteness(): void {
    if (!this.scene.isSetupActive) return;
    const state = this.gameService.getState();
    if (!state.activeTeamId) return;
    const isComplete = this.gameService.isSetupComplete(state.activeTeamId);
    this.eventBus.emit(GameEventNames.UI_SetupComplete, isComplete);
  }

  public destroy(): void {
    if (this.currentHandler) {
      this.currentHandler.exit();
    }
    this.eventBus.off(GameEventNames.PhaseChanged, this.onPhaseChanged);
  }
}
