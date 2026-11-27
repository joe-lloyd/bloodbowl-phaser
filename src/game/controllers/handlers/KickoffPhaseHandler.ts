import type { KickoffService } from "./servicePorts";
import type { KickoffScene } from "./scenePorts";
import { type PhaseHandler } from "./PhaseHandler";
import { type GameEventMap, type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ActionPresentation } from "./actionPresentation";
import { registerActionCommands } from "./actionCommands";
import { KickTargetMarker } from "./KickTargetMarker";
import { ballInTheAir } from "../../rules/balls";

export class KickoffPhaseHandler implements PhaseHandler {
  private handlerRemovers: (() => void)[] = [];
  private ballIsAirborne = false;
  private actions: ActionPresentation | null = null;

  private scene: KickoffScene;
  private gameService: KickoffService;
  private eventBus: IEventBus;
  private readonly kickTarget: KickTargetMarker;
  constructor(
    scene: KickoffScene,
    gameService: KickoffService,
    eventBus: IEventBus
  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
    this.kickTarget = new KickTargetMarker(scene, eventBus);
  }

  enter(): void {
    console.log("[KickoffPhaseHandler] Entering Kickoff Phase");
    this.actions = new ActionPresentation(this.scene, this.eventBus);
    this.setupListeners();
  }

  exit(): void {
    this.actions?.dispose();
    this.actions = null;
    this.removeListeners();
    this.kickTarget.clear();
  }

  private register<K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.handlerRemovers.push(() => {
      this.eventBus.off(event, handler);
    });
  }

  private removeListeners(): void {
    for (const remove of this.handlerRemovers) {
      remove();
    }
    this.handlerRemovers = [];
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
    this.handlerRemovers.push(
      registerActionCommands(this.gameService, this.eventBus)
    );

    this.register(GameEventNames.KickoffStarted, () => {
      this.eventBus.emit(GameEventNames.UI_Notification, "KICKOFF!");
    });

    this.register(GameEventNames.BallKicked, this.handleBallKicked0);

    this.register(GameEventNames.KickoffAirbornePositionChanged, ({ x, y }) => {
      if (!this.ballIsAirborne) return;
      this.moveAirborneBallTo(x, y);
      this.kickTarget.showOnceRolled({ x, y });
    });

    this.register(GameEventNames.GameStateRestored, (state) => {
      this.ballIsAirborne = ballInTheAir(state);
      const square = state.balls[0].at;
      if (!this.ballIsAirborne || !square) {
        this.kickTarget.clear();
        return;
      }
      this.scene.placeBallVisual(
        square.x,
        square.y,
        KickoffPhaseHandler.HANG_HEIGHT
      );
      this.kickTarget.showOnceRolled(square);
    });

    this.register(GameEventNames.PlayerPlaced, () => {
      this.scene.refreshDugouts();
    });

    this.register(GameEventNames.PlayerRemoved, () => {
      this.scene.refreshDugouts();
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
      this.kickTarget.clear();
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
      if (data.isTouchback) this.kickTarget.clear();
      else this.kickTarget.showOnceRolled({ x: data.finalX, y: data.finalY });

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

  private readonly handleKickoffBallLanding2 = ({ landingSquare, isTouchback }: GameEventMap[typeof GameEventNames.KickoffBallLanding]) => {
        const ball = this.ball();
        if (isTouchback || !landingSquare || !ball) this.kickTarget.clear();
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
          .then(() => {
            this.kickTarget.clear();
            return ball.bounce();
          });
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
