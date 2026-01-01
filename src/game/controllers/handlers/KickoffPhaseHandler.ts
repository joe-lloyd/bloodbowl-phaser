import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";

/**
 * KickoffPhaseHandler
 *
 * Handles events specific to the Kickoff Phase:
 * - Ball Kicked Animation
 * - Kickoff Event Resolution
 * - Ball Placement / Scatter
 */
export class KickoffPhaseHandler implements PhaseHandler {
  private handlers: Map<string, (data: any) => void> = new Map();

  constructor(
    private scene: GameScene,
    private gameService: IGameService,
    private eventBus: IEventBus
  ) {}

  enter(): void {
    console.log("[KickoffPhaseHandler] Entering Kickoff Phase");
    this.setupListeners();
    // Kickoff visually resembles "Play" with players on pitch, so we ensure scene state is correct
    // In legacy code, this might share logic with startPlayPhase, or might just prepare players.
    // For now we assume players are placed by Setup Phase ending.
  }

  exit(): void {
    this.removeListeners();
  }

  private register<T = any>(event: string, handler: (data: T) => void): void {
    this.handlers.set(event, handler);
    this.eventBus.on(event as any, handler);
  }

  private removeListeners(): void {
    this.handlers.forEach((handler, event) => {
      this.eventBus.off(event as any, handler);
    });
    this.handlers.clear();
  }

  private setupListeners(): void {
    // Kickoff Started
    this.register(GameEventNames.KickoffStarted, () => {
      this.eventBus.emit(GameEventNames.UI_Notification, "KICKOFF!");
    });

    // Kickoff: Ball kicked animation
    this.register(
      GameEventNames.BallKicked,
      async (data: {
        targetX: number;
        targetY: number;
        finalX: number;
        finalY: number;
        playerId?: string;
      }) => {
        // Logic matched from SceneOrchestrator
        let startX = data.targetX;
        let startY = data.targetY;

        if (data.playerId && this.scene["playerSprites"].has(data.playerId)) {
          const kicker = this.gameService.getPlayerById(data.playerId);
          if (kicker && kicker.gridPosition) {
            startX = kicker.gridPosition.x;
            startY = kicker.gridPosition.y;
          }
        }

        this.scene["placeBallVisual"](startX, startY);
        this.scene["pendingKickoffData"] = data; // Store for scatter sequence

        const ballSprite = this.scene["ballSprite"];
        const ballAnimDuration = 800;

        if (ballSprite) {
          this.eventBus.emit(GameEventNames.Camera_TrackBall, {
            ballSprite,
            animationDuration: ballAnimDuration,
          });

          // Wait for zoom
          await new Promise((resolve) =>
            this.scene.time.delayedCall(1000, () => resolve(null))
          );
        }

        // Animate to Scatter Destination
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
      }
    );

    // Kickoff Result
    this.register(
      GameEventNames.KickoffResult,
      (data: { roll: number; event: string }) => {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          `${data.roll}: ${data.event}`
        );
        if (this.scene["pendingKickoffData"]) {
          // Scatter complete
          this.scene.time.delayedCall(500, () => {
            this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 1000 });
          });
          this.scene["pendingKickoffData"] = null;
        }
      }
    );

    // Ready To Start (Kickoff -> Play)
    this.register(GameEventNames.ReadyToStart, () => {
      this.gameService.startGame(this.scene.kickingTeam.id);
    });

    // Also listen for ball placed during scatter (if any)
    this.register(
      GameEventNames.BallPlaced,
      (data: { x: number; y: number }) => {
        this.scene["placeBallVisual"](data.x, data.y);
      }
    );
  }
}
