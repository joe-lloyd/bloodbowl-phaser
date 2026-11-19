import type { KickoffService } from "./servicePorts";
import type { KickoffScene } from "./scenePorts";
import { type PhaseHandler } from "./PhaseHandler";
import { type GameEventMap, type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { registerActionCommands } from "./actionCommands";

export class KickoffPhaseHandler implements PhaseHandler {
  private removeHandlers: (() => void)[] = [];
  private ballIsAirborne = false;

  private scene: KickoffScene;
  private gameService: KickoffService;
  private eventBus: IEventBus;
  constructor(
    scene: KickoffScene,
    gameService: KickoffService,
    eventBus: IEventBus
  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
  }

  enter(): void {
    console.log("[KickoffPhaseHandler] Entering Kickoff Phase");
    this.setupListeners();
  }

  exit(): void {
    this.removeListeners();
  }

  private register<K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.removeHandlers.push(() => {
      this.eventBus.off(event, handler);
    });
  }

  private removeListeners(): void {
    this.removeHandlers.forEach((remove) => {
      remove();
    });
    this.removeHandlers = [];
  }

  private static readonly HANG_HEIGHT = 9;

  private ball(): KickoffScene["ballSprite"] {
    return this.scene.ballSprite ?? null;
  }

  private moveAirborneBallTo(x: number, y: number): void {
    const ball = this.ball();
    if (!ball) return;
    void ball.flyTo(this.scene.pitch.getPixelPosition(x, y), {
      duration: 800,
      apex: 1.5,
      endHeight: KickoffPhaseHandler.HANG_HEIGHT,
      ease: "Sine.easeInOut",
    });
  }

  private setupListeners(): void {
    this.removeHandlers.push(
      registerActionCommands(this.gameService, this.eventBus)
    );

    this.register(GameEventNames.KickoffStarted, () => {
      this.eventBus.emit(GameEventNames.UI_Notification, "KICKOFF!");
    });

    this.register(GameEventNames.BallKicked, this.handleBallKicked0);

    this.register(GameEventNames.KickoffAirbornePositionChanged, ({ x, y }) => {
      if (!this.ballIsAirborne) return;
      this.moveAirborneBallTo(x, y);
    });

    this.register(GameEventNames.PlayerMoved, this.handlePlayerMoved1);

    this.register(GameEventNames.PlayerPlaced, () => {
      this.scene.refreshDugouts();
    });

    this.register(GameEventNames.PlayerRemoved, () => {
      this.scene.refreshDugouts();
    });

    this.register(GameEventNames.PlayerKnockedDown, ({ playerId }) => {
      this.scene.playerSprites.get(playerId)?.updateStatus();
    });

    this.register(GameEventNames.PlayerStatusChanged, (player) => {
      this.scene.playerSprites.get(player.id)?.updateStatus();
      if (!player.gridPosition) this.scene.refreshDugouts();
    });

    this.register(
      GameEventNames.KickoffBallLanding,
      this.handleKickoffBallLanding2
    );

    this.register(GameEventNames.KickoffResult, this.handleKickoffResult3);

    this.register(GameEventNames.KickoffSequenceCompleted, () => {
      this.ballIsAirborne = false;
    });

    this.register(GameEventNames.ReadyToStart, () => {
      this.gameService.startGame(this.scene.kickingTeam.id);
    });

    this.register(
      GameEventNames.BallPlaced,
      (data: { x: number; y: number }) => {
        if (this.ballIsAirborne) return;
        this.scene.placeBallVisual(data.x, data.y);
      }
    );
  }

  private readonly handleBallKicked0 = (data: GameEventMap[typeof GameEventNames.BallKicked]) => {
      let startX = data.targetX;
      let startY = data.targetY;

      if (data.playerId && this.scene.playerSprites.has(data.playerId)) {
        const kicker = this.gameService.getPlayerById(data.playerId);
        if (kicker?.gridPosition) {
          startX = kicker.gridPosition.x;
          startY = kicker.gridPosition.y;
        }
      }

      this.scene.placeBallVisual(startX, startY, 0.3);
      this.ballIsAirborne = true;

      const ball = this.ball();
      if (!ball) return;
      this.eventBus.emit(GameEventNames.Camera_TrackBall, {
        animationDuration: 1400,
      });
      void ball.flyTo(
        this.scene.pitch.getPixelPosition(data.finalX, data.finalY),
        {
          duration: 1400,
          apex: 6,
          endHeight: KickoffPhaseHandler.HANG_HEIGHT,
          ease: "Sine.easeOut",
        }
      );
    };

  private readonly handlePlayerMoved1 = (data: GameEventMap[typeof GameEventNames.PlayerMoved]) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (!sprite || !data.path?.length) {
        this.scene.refreshDugouts();
        return;
      }
      const pixelPath = data.path.map((step) =>
        this.scene.pitch.getPixelPosition(step.x, step.y)
      );
      void sprite.animateMovement(pixelPath).then(() => {
        this.scene.refreshDugouts();
      });
    };

  private readonly handleKickoffBallLanding2 = ({ landingSquare, isTouchback }: GameEventMap[typeof GameEventNames.KickoffBallLanding]) => {
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

        const position = this.scene.pitch.getPixelPosition(
          landingSquare.x,
          landingSquare.y
        );
        void ball
          .flyTo(position, { duration: 650, apex: 0, ease: "Quad.easeIn" })
          .then(() => ball.bounce());
      };

  private readonly handleKickoffResult3 = (data: GameEventMap[typeof GameEventNames.KickoffResult]) => {
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
    };
}
