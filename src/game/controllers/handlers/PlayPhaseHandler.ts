import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";

/**
 * PlayPhaseHandler
 *
 * Handles Gameplay Events:
 * - Turn Start
 * - Player Movement (Animation trigger)
 * - Actions (Pass, Block)
 *
 * Note: Actual logic is in GameService/FlowManager. This handler connects UI/Visuals to that logic.
 */
export class PlayPhaseHandler implements PhaseHandler {
  private handlers: Map<string, (data: any) => void> = new Map();

  constructor(
    private scene: GameScene,
    private gameService: IGameService,
    private eventBus: IEventBus
  ) {}

  enter(): void {
    console.log("[PlayPhaseHandler] Entering Play Phase");
    this.setupListeners();
    this.scene["startPlayPhase"](); // Trigger scene visual state
  }

  exit(): void {
    this.removeListeners();
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

  private setupListeners(): void {
    this.register(GameEventNames.TurnStarted, (turn) => {
      this.scene.refreshDugouts();
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Turn ${turn.turnNumber}`
      );
    });

    this.register(GameEventNames.PlayerMoved, (data) =>
      this.handlePlayerMove(data)
    );

    // Pass Declaration - Zoom In
    this.register(GameEventNames.PassDeclared, (data) => {
      // Logic moved from SceneOrchestrator
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) {
        this.eventBus.emit(GameEventNames.Camera_TrackBall, {
          ballSprite: sprite, // Track passer initially
          animationDuration: 800,
        });
      }
    });

    // Pass Attempted - Animate Ball
    this.register(GameEventNames.PassAttempted, (data) =>
      this.handlePassAnimation(data)
    );

    // --- MISSING HANDLERS RESTORED ---

    // --- MISSING HANDLERS RESTORED ---
    // Kickoff logic moved to KickoffPhaseHandler

    // Ready To Start (Kickoff -> Play)
    // REMOVED from PlayPhase, handled in KickoffPhase transition

    // Block Dice
    this.register(GameEventNames.UI_RollBlockDice, (data) => {
      // Delegate to GameService (Model)
      // Note: UI usually triggers this, but we listen to relay it?
      // Actually SceneOrchestrator relayed it.
      this.gameService.rollBlockDice(
        data.attackerId,
        data.defenderId,
        data.numDice,
        data.isAttackerChoice
      );
    });

    // Block Result Selected
    this.register(GameEventNames.UI_BlockResultSelected, (data) => {
      this.gameService.resolveBlock(
        data.attackerId,
        data.defenderId,
        data.result
      );
    });

    // Push Follow Up Response
    this.register(GameEventNames.UI_FollowUpResponse, (data) => {
      if (data.followUp && data.targetSquare) {
        this.gameService.movePlayer(data.attackerId, [data.targetSquare]);
      }
      this.gameService.finishActivation(data.attackerId);
    });

    // Status Updates
    this.register(GameEventNames.PlayerKnockedDown, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) sprite.updateStatus();
    });

    this.register(GameEventNames.PlayerStoodUp, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) sprite.updateStatus();
    });

    this.register(
      GameEventNames.BallPlaced,
      (data: { x: number; y: number }) => {
        this.scene["placeBallVisual"](data.x, data.y);
      }
    );

    // Fumble / Bounce
    this.register(
      GameEventNames.PassFumbled,
      (data: {
        playerId: string;
        position: { x: number; y: number };
        bouncePosition: { x: number; y: number };
      }) => {
        const ballSprite = this.scene["ballSprite"];
        if (ballSprite) {
          this.scene["placeBallVisual"](data.position.x, data.position.y);
          const target = this.scene["pitch"].getPixelPosition(
            data.bouncePosition.x,
            data.bouncePosition.y
          );
          this.scene.tweens.add({
            targets: ballSprite,
            x: target.x,
            y: target.y,
            duration: 400,
            ease: "Bounce.easeOut",
          });
        }
      }
    );
  }

  private handlePlayerMove(data: any): void {
    // Trigger Animation on Scene
    if (data.path && data.path.length > 0) {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) {
        const pixelPath = data.path.map((step: any) =>
          this.scene["pitch"].getPixelPosition(step.x, step.y)
        );
        sprite.animateMovement(pixelPath).then(() => {
          this.scene.refreshDugouts();
          // Check follow up
          if (data.followUpData) {
            this.eventBus.emit(
              GameEventNames.UI_FollowUpPrompt,
              data.followUpData
            );
          }
        });
      }
    } else {
      this.scene.refreshDugouts();
    }
  }

  private handlePassAnimation(data: any): void {
    // Trigger Ball Animation
    const ballSprite = this.scene["ballSprite"];
    if (!ballSprite) return;

    this.scene["placeBallVisual"](data.from.x, data.from.y);

    const p1 = this.scene["pitch"].getPixelPosition(
      data.finalPosition.x,
      data.finalPosition.y
    );

    this.scene.tweens.add({
      targets: this.scene["ballSprite"],
      x: p1.x,
      y: p1.y,
      duration: 1000,
      ease: "Quad.easeInOut",
      onStart: () => {
        this.scene.tweens.add({
          targets: this.scene["ballSprite"],
          scaleX: 1.5,
          scaleY: 1.5,
          duration: 500,
          yoyo: true,
        });
      },
    });
  }
}
