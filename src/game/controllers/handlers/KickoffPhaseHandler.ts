import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import {
  GameEventMap,
  IEventBus,
} from "../../../services/EventBus";
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

  private moveAirborneBallTo(x: number, y: number): void {
    const ballSprite = this.scene["ballSprite"];
    if (!ballSprite) return;

    const position = this.scene["pitch"].getPixelPosition(x, y);
    this.scene.tweens.add({
      targets: ballSprite,
      x: position.x,
      y: position.y,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0.55,
      duration: 800,
      ease: "Quad.easeOut",
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

        this.scene["placeBallVisual"](startX, startY);
        this.kickoffSceneState().pendingKickoffData = data;
        this.ballIsAirborne = true;

        // The one real ball moves to the deviated square and stays enlarged
        // there while the kickoff table (including interactive steps)
        // resolves. Enlarged and translucent means airborne; this is not a
        // landing. The gameplay camera intentionally stays fixed.
        this.moveAirborneBallTo(data.finalX, data.finalY);
      }
    );

    this.register(
      GameEventNames.KickoffAirbornePositionChanged,
      ({ x, y }) => {
        if (!this.ballIsAirborne) return;
        this.moveAirborneBallTo(x, y);
      }
    );

    // Interactive kickoff events mutate normal player state while the play
    // phase handler is not installed. Mirror its board/status listeners here
    // so Quick Snap, Solid Defence, High Kick and Pitch Invasion are visible
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
        const ballSprite = this.scene["ballSprite"];
        if (!ballSprite) return;

        if (isTouchback || !landingSquare) {
          this.scene.tweens.add({
            targets: ballSprite,
            alpha: 0,
            duration: 500,
            ease: "Quad.easeIn",
          });
          return;
        }

        const position = this.scene["pitch"].getPixelPosition(
          landingSquare.x,
          landingSquare.y
        );
        this.scene.tweens.add({
          targets: ballSprite,
          x: position.x,
          y: position.y,
          scaleX: 0.5,
          scaleY: 0.5,
          alpha: 1,
          duration: 650,
          ease: "Quad.easeIn",
        });
      }
    );

    // Kickoff Result: one durable log entry carrying the roll, the named
    // event, and what it does — including what each team actually received.
    this.register(
      GameEventNames.KickoffResult,
      (data) => {
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
      }
    );

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
