import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import {
  GameEventMap,
  IEventBus,
} from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { BallSprite } from "../../elements/BallSprite";

/**
 * KickoffPhaseHandler
 *
 * Handles events specific to the Kickoff Phase:
 * - Ball Kicked Animation
 * - Kickoff Event Resolution
 * - Ball Placement / Scatter
 */
export class KickoffPhaseHandler implements PhaseHandler {
  private removeHandlers: Array<() => void> = [];
  private ballIsAirborne = false;

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

  private register<K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.removeHandlers.push(() => this.eventBus.off(event, handler));
  }

  private removeListeners(): void {
    this.removeHandlers.forEach((remove) => remove());
    this.removeHandlers = [];
  }

  /** How high the ball hangs while the kick-off table resolves. */
  private static readonly HANG_HEIGHT = 9;

  private ball(): BallSprite | null {
    return (this.scene["ballSprite"] as BallSprite | null) ?? null;
  }

  /**
   * Carry the airborne ball over a new square. It stays up at hang height,
   * its shadow on the turf showing where it will come down.
   */
  private moveAirborneBallTo(x: number, y: number): void {
    const ball = this.ball();
    if (!ball) return;
    void ball.flyTo(this.scene["pitch"].getPixelPosition(x, y), {
      duration: 800,
      apex: 1.5,
      endHeight: KickoffPhaseHandler.HANG_HEIGHT,
      ease: "Sine.easeInOut",
    });
  }

  private kickoffSceneState(): {
    pendingKickoffData: GameEventMap[GameEventNames.BallKicked] | null;
  } {
    return this.scene as unknown as {
      pendingKickoffData: GameEventMap[GameEventNames.BallKicked] | null;
    };
  }

  private setupListeners(): void {
    // Kickoff Started
    this.register(GameEventNames.KickoffStarted, () => {
      this.eventBus.emit(GameEventNames.UI_Notification, "KICKOFF!");
    });

    // Kickoff: Ball kicked animation
    this.register(
      GameEventNames.BallKicked,
      (data) => {
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

      this.scene["placeBallVisual"](startX, startY, 0.3);
      this.kickoffSceneState().pendingKickoffData = data;
      this.ballIsAirborne = true;

      // The kick: the ball climbs high and comes to hang over the square
      // it deviated to while the kick-off table (including interactive
      // steps) resolves; the shadow on the turf marks the landing. The
      // camera rides along with it.
      const ball = this.ball();
      if (!ball) return;
      this.eventBus.emit(GameEventNames.Camera_TrackBall, {
        animationDuration: 1400,
      });
      void ball.flyTo(
        this.scene["pitch"].getPixelPosition(data.finalX, data.finalY),
        {
          duration: 1400,
          apex: 6,
          endHeight: KickoffPhaseHandler.HANG_HEIGHT,
          ease: "Sine.easeOut",
        }
      );
    });

    this.register(
      GameEventNames.KickoffAirbornePositionChanged,
      ({ x, y }) => {
        if (!this.ballIsAirborne) return;
        this.moveAirborneBallTo(x, y);
      }
    );

    // Interactive kickoff events mutate normal player state while the play
    // phase handler is not installed. Mirror its board/status listeners here
    // so Quick Snap, Alert Defence, High Kick and Pitch Invasion are visible
    // immediately instead of only appearing after the first normal turn.
    this.register(GameEventNames.PlayerMoved, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (!sprite || !data.path?.length) {
        this.scene.refreshDugouts();
        return;
      }
      const pixelPath = data.path.map((step) =>
        this.scene["pitch"].getPixelPosition(step.x, step.y)
      );
      void sprite.animateMovement(pixelPath).then(() => {
        this.scene.refreshDugouts();
      });
    });

    this.register(GameEventNames.PlayerPlaced, () => {
      this.scene.refreshDugouts();
    });

    this.register(GameEventNames.PlayerRemoved, () => {
      this.scene.refreshDugouts();
    });

    this.register(GameEventNames.PlayerKnockedDown, ({ playerId }) => {
      this.scene["playerSprites"].get(playerId)?.updateStatus();
    });

    this.register(GameEventNames.PlayerStatusChanged, (player) => {
      this.scene["playerSprites"].get(player.id)?.updateStatus();
      if (!player.gridPosition) this.scene.refreshDugouts();
    });

    this.register(
      GameEventNames.KickoffBallLanding,
      ({ landingSquare, isTouchback }) => {
        const ball = this.ball();
        if (!ball) return;

        if (isTouchback || !landingSquare) {
          this.scene.tweens.add({
            targets: ball,
            alpha: 0,
            duration: 500,
            ease: "Quad.easeIn",
          });
          this.eventBus.emit(GameEventNames.Camera_Reset, { duration: 900 });
          return;
        }

        // Down it comes, with a hop where it lands.
        const position = this.scene["pitch"].getPixelPosition(
          landingSquare.x,
          landingSquare.y
        );
        void ball
          .flyTo(position, { duration: 650, apex: 0, ease: "Quad.easeIn" })
          .then(() => ball.bounce());
      }
    );

    // Kickoff Result: one durable log entry carrying the roll, the named
    // event, and what it does — including what each team actually received.
    this.register(GameEventNames.KickoffResult, (data) => {
      const effects = Object.entries(data.outcome.perTeam)
        .flatMap(([teamId, lines]) =>
          lines.map(
            (line) =>
              `${this.gameService.getTeam(teamId)?.name ?? teamId}: ${line}`
          )
        )
        .join("; ");
      this.eventBus.emit(GameEventNames.UI_LogEntry, {
        category: "kickoff",
        headline: data.event,
        detail: effects ? `${data.meaning} ${effects}` : data.meaning,
        roll: data.roll,
      });
    });

    this.register(GameEventNames.KickoffSequenceCompleted, () => {
      this.ballIsAirborne = false;
      this.kickoffSceneState().pendingKickoffData = null;
    });

    // Ready To Start (Kickoff -> Play)
    this.register(GameEventNames.ReadyToStart, () => {
      this.gameService.startGame(this.scene.kickingTeam.id);
    });

    // Also listen for ball placed during scatter (if any)
    this.register(
      GameEventNames.BallPlaced,
      (data: { x: number; y: number }) => {
        if (this.ballIsAirborne) return;
        this.scene["placeBallVisual"](data.x, data.y);
      }
    );
  }
}
