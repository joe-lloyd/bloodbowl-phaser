import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { IEventBus } from "../../services/EventBus";
import { GamePhase, SubPhase } from "../../types/GameState";
import { GameEventNames } from "../../types/events";

/**
 * SceneOrchestrator - Manages game flow and phase transitions
 *
 * Extracted from GameScene to separate view logic from game flow logic.
 * Handles event coordination, phase transitions, and delegates to appropriate controllers.
 */

interface SceneOrchestratorConfig {
  skipCoinFlip?: boolean; // For scenarios that start mid-game
  startingPhase?: GamePhase; // Override starting phase
  startingSubPhase?: SubPhase; // Override starting subphase
}

export class SceneOrchestrator {
  private scene: GameScene;
  private gameService: IGameService;
  private eventBus: IEventBus;
  private config: SceneOrchestratorConfig;

  private eventHandlers: Map<string, Function> = new Map();

  constructor(
    scene: GameScene,
    gameService: IGameService,
    eventBus: IEventBus,
    config: SceneOrchestratorConfig = {}
  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
    this.config = config;
  }

  /**
   * Setup all event listeners for game flow
   */
  public setupEventListeners(): void {
    // Coin flip handling
    const onCoinFlipComplete = (data: {
      kickingTeam: any;
      receivingTeam: any;
    }) => {
      this.scene.kickingTeam = data.kickingTeam;
      this.scene.receivingTeam = data.receivingTeam;
      this.gameService.startSetup(data.kickingTeam.id);
    };
    this.eventHandlers.set(
      GameEventNames.UI_CoinFlipComplete,
      onCoinFlipComplete
    );
    this.eventBus.on(GameEventNames.UI_CoinFlipComplete, onCoinFlipComplete);

    // Setup actions (confirm, randomize, clear, save, load)
    const onSetupAction = (data: { action: string }) => {
      const state = this.gameService.getState();
      const activeTeamId = state.activeTeamId || this.scene.team1.id;
      const activeTeam =
        activeTeamId === this.scene.team1.id
          ? this.scene.team1
          : this.scene.team2;
      const isTeam1 = activeTeam.id === this.scene.team1.id;

      switch (data.action) {
        case "confirm":
          this.gameService.confirmSetup(activeTeam.id);
          break;
        case "default":
          const defFormation =
            this.scene["formationManager"].getDefaultFormation(isTeam1);
          this.scene["placementController"].loadFormation(defFormation);
          this.scene.refreshDugouts();
          break;
        case "clear":
          this.scene["placementController"].clearPlacements();
          this.scene.refreshDugouts();
          break;
        case "save":
          const placements = this.scene["placementController"].getPlacements();
          if (placements.length > 0) {
            this.scene["formationManager"].saveFormation(
              activeTeam.id,
              placements,
              "Custom"
            );
            this.eventBus.emit(
              GameEventNames.UI_Notification,
              "Formation Saved!"
            );
          }
          break;
        case "load":
          const savedFormation = this.scene["formationManager"].loadFormation(
            activeTeam.id,
            "Custom"
          );
          if (savedFormation) {
            this.scene["placementController"].loadFormation(savedFormation);
            this.scene.refreshDugouts();
          } else {
            this.eventBus.emit(
              GameEventNames.UI_Notification,
              "No Saved Formation"
            );
          }
          break;
      }
    };
    this.eventHandlers.set(GameEventNames.UI_SetupAction, onSetupAction);
    this.eventBus.on(GameEventNames.UI_SetupAction, onSetupAction);

    // Kickoff: Ball kicked animation
    const onBallKicked = async (data: any) => {
      let startX = data.targetX;
      let startY = data.targetY;

      if (data.playerId && this.scene["playerSprites"].has(data.playerId)) {
        const kickerPlayer = this.gameService.getPlayerById(data.playerId);
        if (kickerPlayer && kickerPlayer.gridPosition) {
          startX = kickerPlayer.gridPosition.x;
          startY = kickerPlayer.gridPosition.y;
        }
      }

      this.scene["placeBallVisual"](startX, startY);

      // Store kick data immediately for scatter animation later
      this.scene["pendingKickoffData"] = data;

      const ballSprite = this.scene["ballSprite"];
      const ballAnimDuration = 800; // Ball animation duration

      if (ballSprite) {
        // Emit camera event to start tracking the ball
        this.eventBus.emit(GameEventNames.Camera_TrackBall, {
          ballSprite,
          animationDuration: ballAnimDuration,
        });

        // Wait for camera to pan (500ms) and zoom (400ms) before animating ball
        await new Promise((resolve) =>
          this.scene.time.delayedCall(1000, () => resolve(null))
        );
      }

      // Use FINAL scatter position for animation (scatter already calculated)
      const finalTargetPos = this.scene["pitch"].getPixelPosition(
        data.finalX,
        data.finalY
      );

      this.scene.tweens.add({
        targets: this.scene["ballSprite"],
        x: finalTargetPos.x,
        y: finalTargetPos.y,
        duration: ballAnimDuration,
        ease: "Quad.easeOut",
        onStart: () => {
          this.scene["ballSprite"]?.setScale(0.5);
        },
        yoyo: false,
      });

      this.scene.tweens.add({
        targets: this.scene["ballSprite"],
        scaleX: 1.5,
        scaleY: 1.5,
        duration: 400,
        yoyo: true,
        ease: "Sine.easeOut",
      });
    };
    this.eventHandlers.set(GameEventNames.BallKicked, onBallKicked);
    this.eventBus.on(GameEventNames.BallKicked, onBallKicked);

    // Kickoff result notification
    const onKickoffResult = (data: { roll: number; event: string }) => {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `${data.roll}: ${data.event}`
      );
      if (this.scene["pendingKickoffData"]) {
        // Scatter was already applied - ball is at final position
        // Emit camera reset event after a short delay
        this.scene.time.delayedCall(500, () => {
          this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
        });
        this.scene["pendingKickoffData"] = null;
      }
    };
    this.eventHandlers.set(GameEventNames.KickoffResult, onKickoffResult);
    this.eventBus.on(GameEventNames.KickoffResult, onKickoffResult);

    // Ready to start (transition from kickoff to play)
    const onReadyToStart = () => {
      this.gameService.startGame(this.scene.kickingTeam.id);
    };
    this.eventHandlers.set(GameEventNames.ReadyToStart, onReadyToStart);
    this.eventBus.on(GameEventNames.ReadyToStart, onReadyToStart);

    // Phase change handling
    const onPhaseChanged = (data: {
      phase: GamePhase;
      subPhase?: SubPhase;
      activeTeamId?: string;
    }) => {
      this.handlePhaseChange(data.phase, data.subPhase);
    };
    this.eventHandlers.set(GameEventNames.PhaseChanged, onPhaseChanged);
    this.eventBus.on(GameEventNames.PhaseChanged, onPhaseChanged);

    // Turn management
    const onTurnStarted = (turn: any) => {
      this.scene.refreshDugouts();
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Turn ${turn.turnNumber}`
      );
    };
    this.eventHandlers.set(GameEventNames.TurnStarted, onTurnStarted);
    this.eventBus.on(GameEventNames.TurnStarted, onTurnStarted);

    // Player movement
    const onPlayerMoved = (data: {
      playerId: string;
      from: any;
      to: any;
      path?: any[];
      followUpData?: {
        attackerId: string;
        targetSquare: { x: number; y: number };
      };
    }) => {
      if (data.path && data.path.length > 0) {
        const sprite = this.scene["playerSprites"].get(data.playerId);
        if (sprite) {
          const pixelPath = data.path.map((step: any) =>
            this.scene["pitch"].getPixelPosition(step.x, step.y)
          );
          sprite.animateMovement(pixelPath).then(() => {
            this.scene.refreshDugouts();
            this.scene["checkSetupCompleteness"]();

            // Emit follow-up prompt after animation completes
            if (data.followUpData) {
              this.eventBus.emit(
                GameEventNames.UI_FollowUpPrompt,
                data.followUpData
              );
            }
          });
        } else {
          this.scene.refreshDugouts();
          // No sprite, no animation - show follow-up immediately if present
          if (data.followUpData) {
            this.eventBus.emit(
              GameEventNames.UI_FollowUpPrompt,
              data.followUpData
            );
          }
        }
      } else {
        this.scene.refreshDugouts();
        // No path, no animation - show follow-up immediately if present
        if (data.followUpData) {
          this.eventBus.emit(
            GameEventNames.UI_FollowUpPrompt,
            data.followUpData
          );
        }
      }

      // Clear all highlights using the GameplayInteractionController's method
      // This ensures controller-managed highlights (push, etc.) are cleared before pitch highlights
      if (this.scene["gameplayController"]) {
        this.scene["gameplayController"].clearAllInteractionHighlights();
      } else {
        // Fallback for scenes without gameplayController
        this.scene["pitch"].clearPath();
        this.scene["pitch"].clearHighlights();
      }
    };
    this.eventHandlers.set(GameEventNames.PlayerMoved, onPlayerMoved);
    this.eventBus.on(GameEventNames.PlayerMoved, onPlayerMoved);

    // Kickoff events
    const onKickoffStarted = () => {
      this.eventBus.emit(GameEventNames.UI_Notification, "KICKOFF!");
    };
    this.eventHandlers.set(GameEventNames.KickoffStarted, onKickoffStarted);
    this.eventBus.on(GameEventNames.KickoffStarted, onKickoffStarted);

    // Block dice rolling
    const onRollBlockDice = (data: {
      attackerId: string;
      defenderId: string;
      numDice: number;
      isAttackerChoice: boolean;
    }) => {
      this.gameService.rollBlockDice(
        data.attackerId,
        data.defenderId,
        data.numDice,
        data.isAttackerChoice
      );
    };
    this.eventHandlers.set(GameEventNames.UI_RollBlockDice, onRollBlockDice);
    this.eventBus.on(GameEventNames.UI_RollBlockDice, onRollBlockDice);

    // Block result selection
    const onBlockResultSelected = (data: {
      attackerId: string;
      defenderId: string;
      result: any;
    }) => {
      this.gameService.resolveBlock(
        data.attackerId,
        data.defenderId,
        data.result
      );
    };
    this.eventHandlers.set(
      GameEventNames.UI_BlockResultSelected,
      onBlockResultSelected
    );
    this.eventBus.on(
      GameEventNames.UI_BlockResultSelected,
      onBlockResultSelected
    );

    // Follow-up response
    const onFollowUpResponse = (data: {
      attackerId: string;
      followUp: boolean;
      targetSquare?: { x: number; y: number };
    }) => {
      if (data.followUp && data.targetSquare) {
        // Move attacker to the defender's old square
        this.gameService.movePlayer(data.attackerId, [data.targetSquare]);
      }
      // End the attacker's activation
      this.gameService.finishActivation(data.attackerId);
    };
    this.eventHandlers.set(
      GameEventNames.UI_FollowUpResponse,
      onFollowUpResponse
    );
    this.eventBus.on(GameEventNames.UI_FollowUpResponse, onFollowUpResponse);

    // Player knocked down - update visual status
    const onPlayerKnockedDown = (data: { playerId: string }) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) {
        sprite.updateStatus();
      }
    };
    this.eventHandlers.set(
      GameEventNames.PlayerKnockedDown,
      onPlayerKnockedDown
    );
    this.eventBus.on(GameEventNames.PlayerKnockedDown, onPlayerKnockedDown);

    // Player stood up - update visual status
    const onPlayerStoodUp = (data: { playerId: string; cost: number }) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) {
        sprite.updateStatus();
      }
    };
    this.eventHandlers.set(GameEventNames.PlayerStoodUp, onPlayerStoodUp);
    this.eventBus.on(GameEventNames.PlayerStoodUp, onPlayerStoodUp);

    // Ball placement - create ball sprite when ball is placed
    const onBallPlaced = (data: { x: number; y: number }) => {
      this.scene["placeBallVisual"](data.x, data.y);
    };
    this.eventHandlers.set(GameEventNames.BallPlaced, onBallPlaced);
    this.eventBus.on(GameEventNames.BallPlaced, onBallPlaced);
  }

  /**
   * Start the setup phase (coin flip)
   * Delegates to scene to allow overrides (e.g., SandboxScene skips coin flip)
   */
  public startSetupPhase(): void {
    // Call scene's startSetupPhase to allow overrides
    this.scene.startSetupPhase();
  }

  /**
   * Start placement for a specific team
   */
  public startPlacement(subPhase: SubPhase): void {
    const isKicking = subPhase === SubPhase.SETUP_KICKING;
    const activeTeam = isKicking
      ? this.scene.kickingTeam
      : this.scene.receivingTeam;
    const isTeam1 = activeTeam.id === this.scene.team1.id;

    this.eventBus.emit(GameEventNames.UI_ShowSetupControls, {
      subPhase,
      activeTeam,
    });

    // Tell scene to highlight setup zone (visual only)
    this.scene.highlightSetupZone(isTeam1);

    // Tell scene to enable placement (wiring controllers)
    this.scene.enablePlacement(activeTeam, isTeam1);
  }

  /**
   * Check if setup is complete and emit UI event
   */
  public checkSetupCompleteness(): void {
    if (!this.scene.isSetupActive) return;
    const state = this.gameService.getState();
    if (!state.activeTeamId) return;

    const isComplete = this.gameService.isSetupComplete(state.activeTeamId);
    this.eventBus.emit(GameEventNames.UI_SetupComplete, isComplete);
  }

  /**
   * Handle phase transitions
   */
  private handlePhaseChange(phase: GamePhase, subPhase?: SubPhase): void {
    if (phase === GamePhase.SETUP) {
      if (subPhase === SubPhase.SETUP_KICKING) {
        this.startPlacement(SubPhase.SETUP_KICKING);
      } else if (subPhase === SubPhase.SETUP_RECEIVING) {
        this.startPlacement(SubPhase.SETUP_RECEIVING);
      } else if (subPhase === SubPhase.COIN_FLIP) {
        this.startSetupPhase();
      }
    } else if (phase === GamePhase.PLAY) {
      this.scene["startPlayPhase"]();
    } else if (phase === GamePhase.KICKOFF) {
      this.scene["startKickoffPhase"](subPhase);
    }
  }

  /**
   * Initialize the game based on current state
   */
  public initialize(): void {
    const state = this.gameService.getState();

    if (this.config.startingPhase) {
      // Scenario mode - start at specific phase
      this.handlePhaseChange(
        this.config.startingPhase,
        this.config.startingSubPhase
      );
    } else if (state.phase === GamePhase.SETUP) {
      this.startSetupPhase();
    } else {
      this.scene["startPlayPhase"]();
    }
  }

  /**
   * Cleanup event listeners
   */
  public destroy(): void {
    this.eventHandlers.forEach((handler, event) => {
      this.eventBus.off(event, handler as any);
    });
    this.eventHandlers.clear();
  }
}
