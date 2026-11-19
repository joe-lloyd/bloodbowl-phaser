import type { ActionCommandService } from "./actionCommands";
import type { PlayScene } from "./scenePorts";
import Phaser from "phaser";
import { type PhaseHandler } from "./PhaseHandler";
import { type GameEventMap, type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { registerActionCommands } from "./actionCommands";
import { CARRIED_HEIGHT } from "../../elements/BallSprite";
import { ISO } from "../../elements/GridUtils";
import { PLAYER_DEPTH } from "../../elements/PlayerSprite";
import { DiceWatch } from "../../presentation/diceWatch";

function facingDirection(dx: number): number {
  const direction = Math.sign(dx);
  return direction === 0 || Number.isNaN(direction) ? 1 : direction;
}

export class PlayPhaseHandler implements PhaseHandler {
  private unsubscribes: (() => void)[] = [];
  private dice: DiceWatch | null = null;

  private ballMoves = 0;

  private scene: PlayScene;
  private gameService: ActionCommandService;
  private eventBus: IEventBus;
  constructor(
    scene: PlayScene,
    gameService: ActionCommandService,
    eventBus: IEventBus
  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
  }

  enter(): void {
    console.log("[PlayPhaseHandler] Entering Play Phase");
    this.dice = new DiceWatch(this.eventBus);
    this.setupListeners();
    this.scene.startPlayPhase();
  }

  exit(): void {
    this.ballMoves++;
    this.removeListeners();
    this.dice?.dispose();
    this.dice = null;
  }

  private register<K extends keyof GameEventMap>(
    event: K,
    handler: (data: GameEventMap[K]) => void
  ): void {
    this.eventBus.on(event, handler);
    this.unsubscribes.push(() => {
      this.eventBus.off(event, handler);
    });
  }

  private removeListeners(): void {
    this.unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribes = [];
  }

  private setupListeners(): void {
    this.register(GameEventNames.TurnStarted, (turn) => {
      this.scene.refreshDugouts();
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Turn ${String(turn.turnNumber)}`
      );
    });

    this.register(GameEventNames.PlayerMoved, (data) => {
      this.handlePlayerMove(data);
    });

    this.register(GameEventNames.PlayerThrowGesture, this.handlePlayerThrowGesture0);

    this.register(GameEventNames.PassDeclared, (data) => {
      this.eventBus.emit(GameEventNames.Camera_TrackBall, {
        playerId: data.playerId,
        animationDuration: 800,
      });
    });

    this.register(GameEventNames.PassAttempted, (data) => {
      this.handlePassAnimation(data);
    });

    this.register(GameEventNames.PuntDeclared, (data) => {
      this.handlePuntDeclaration(data);
    });

    this.register(GameEventNames.BombThrown, (data) => {
      this.handleBombThrow(data);
    });
    this.register(GameEventNames.BombExploded, (data) => {
      this.handleBombExplosion(data);
    });

    this.unsubscribes.push(
      registerActionCommands(this.gameService, this.eventBus)
    );

    this.register(GameEventNames.BlockDiceKept, this.handleBlockDiceKept1);

    this.register(GameEventNames.PlayerKnockedDown, (data) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (sprite)
        void this.afterStep(sprite).then(() => {
          sprite.updateStatus();
        });
    });

    this.register(GameEventNames.PlayerPushedIntoCrowd, this.handlePlayerPushedIntoCrowd2);

    this.register(GameEventNames.PlayerStatusChanged, this.handlePlayerStatusChanged3);

    this.register(GameEventNames.PlayerStoodUp, (data) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (sprite) sprite.updateStatus();
    });

    this.register(GameEventNames.BallPlaced, () => {
      this.ballMoves++;
      this.scene.reconcileBallVisual();
    });

    this.register(GameEventNames.BallPickup, () => {
      this.ballMoves++;
      this.scene.reconcileBallVisual();
    });

    this.register(GameEventNames.PassFumbled, this.handlePassFumbled4);
  }

  private acknowledge(presentationId: string | undefined): void {
    if (presentationId)
      this.eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: presentationId,
      });
  }

  private handlePlayerMove(
    data: GameEventMap[typeof GameEventNames.PlayerMoved]
  ): void {
    const acknowledge = () => {
      this.acknowledge(data.presentationId);
    };
    const sprite = this.scene.playerSprites.get(data.playerId);
    if (!sprite) {
      this.scene.refreshDugouts();
      acknowledge();
      return;
    }
    if (!data.path?.length) {
      sprite.motion = sprite.motion.finally(() => {
        this.scene.refreshDugouts();
        acknowledge();
      });
      return;
    }
    const pixelPath = data.path.map((step) =>
      this.scene.pitch.getPixelPosition(step.x, step.y)
    );
    sprite.motion = sprite.motion
      .then(() => this.dice?.landed())
      .then(async () => {
        if (data.ballFrom && data.ballPath && data.ballPath.length > 0) {
          this.scene.animateBallAlong(
            data.ballFrom,
            data.ballPath,
            (data.ballJoinStep ?? 0) * 180
          );
        }
        await (data.thrown
          ? sprite.animateThrow(pixelPath)
          : sprite.animateMovement(pixelPath));
        this.scene.refreshDugouts();
        if (data.followUpData) {
          this.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
            ...data.followUpData,
            repeat: true,
          });
        }
      })
      .finally(acknowledge);
  }

  private async afterStep(sprite: { motion: Promise<void> }): Promise<void> {
    await this.dice?.landed();

    await sprite.motion;
  }

  private handlePassAnimation(
    data: GameEventMap[typeof GameEventNames.PassAttempted]
  ): void {
    const thrower = this.scene.playerSprites.get(data.playerId);
    if (thrower) {
      const target = this.scene.pitch.getPixelPosition(data.to.x, data.to.y);
      thrower.playAction("pass", target, () => {
        thrower.animateThrowGesture(facingDirection(target.x - thrower.x));
      });
    }
    if (!this.scene.ballSprite) return;
    this.scene.placeBallVisual(data.from.x, data.from.y, CARRIED_HEIGHT);
    const ball = this.scene.ballSprite;
    const squares = Math.hypot(
      data.finalPosition.x - data.from.x,
      data.finalPosition.y - data.from.y
    );
    this.eventBus.emit(GameEventNames.Camera_TrackBall, {
      animationDuration: 1000,
    });
    void ball.flyTo(
      this.scene.pitch.getPixelPosition(
        data.finalPosition.x,
        data.finalPosition.y
      ),
      {
        duration: 500 + squares * 70,
        apex: 1 + squares * 0.6,
        endHeight: 0,
        ease: "Linear",
      }
    );
  }

  private handlePuntDeclaration(
    data: GameEventMap[typeof GameEventNames.PuntDeclared]
  ): void {
    const acknowledge = () => {
      this.eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: data.presentationId,
      });
    };

    this.scene.playerSprites
      .get(data.playerId)
      ?.animateKickGesture(facingDirection(data.direction.x));

    const ballSprite = this.scene.ballSprite;
    const pitch = this.scene.pitch;
    if (!ballSprite) {
      acknowledge();
      return;
    }

    const target = pitch.getPixelPosition(data.landing.x, data.landing.y);
    void ballSprite.flyTo(target, { duration: 900, apex: 7 }).then(acknowledge);
  }

  private handleBombThrow(data: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  }): void {
    const pitch = this.scene.pitch;
    const p0 = pitch.getPixelPosition(data.from.x, data.from.y);
    const p1 = pitch.getPixelPosition(data.to.x, data.to.y);

    const bomb = this.scene.createBombSprite(p0.x, p0.y);
    const dist = Phaser.Math.Distance.Between(p0.x, p0.y, p1.x, p1.y);
    const arc = Math.min(160, 50 + dist * 0.25);

    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 600,
      ease: "Quad.easeInOut",
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        bomb.x = Phaser.Math.Linear(p0.x, p1.x, t);
        bomb.y =
          Phaser.Math.Linear(p0.y, p1.y, t) - arc * Math.sin(Math.PI * t);
        bomb.rotation += 0.18;
      },
      onComplete: () => {
        bomb.destroy();
      },
    });
  }

  private showExplosionArea(data: { x: number; y: number }, centre: { x: number; y: number }): void {
    const pitch = this.scene.pitch;
    const area = this.scene.add.graphics();
    area.setDepth(PLAYER_DEPTH + centre.y + 50);
    area.fillStyle(0xff7722, 0.35);
    area.fillPoints(
      ([
        [data.x - 1, data.y - 1],
        [data.x + 2, data.y - 1],
        [data.x + 2, data.y + 2],
        [data.x - 1, data.y + 2],
      ] as const).map(([gx, gy]) => {
        const p = pitch.getPointPosition(gx, gy);
        return new Phaser.Math.Vector2(p.x, p.y);
      }),
      true
    );
    this.scene.tweens.add({
      targets: area,
      alpha: 0,
      duration: 550,
      ease: "Quad.easeOut",
      onComplete: () => {
        area.destroy();
      },
    });

  }

  private handleBombExplosion(data: { x: number; y: number }): void {
    const pitch = this.scene.pitch;
    const centre = pitch.getPixelPosition(data.x, data.y);
    const s = ISO.tileHeight;

    this.showExplosionArea(data, centre);

    const fireball = this.scene.add.graphics();
    fireball.setDepth(PLAYER_DEPTH + centre.y + 60);
    fireball.fillStyle(0xff4400, 0.55);
    fireball.fillCircle(0, 0, s * 1.5);
    fireball.fillStyle(0xffaa22, 0.7);
    fireball.fillCircle(0, 0, s * 0.95);
    fireball.fillStyle(0xffffdd, 0.9);
    fireball.fillCircle(0, 0, s * 0.45);
    fireball.setPosition(centre.x, centre.y);
    fireball.setScale(0.3);
    this.scene.tweens.add({
      targets: fireball,
      scale: 1.15,
      alpha: 0,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: () => {
        fireball.destroy();
      },
    });

    this.scene.cameras.main.shake(220, 0.006);
  }

  private readonly handlePlayerThrowGesture0 = (data: GameEventMap[typeof GameEventNames.PlayerThrowGesture]) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (!sprite) return;
      if (data.mode === "kick") {
        sprite.animateKickGesture(data.dir);
      } else {
        sprite.animateThrowGesture(data.dir);
      }
    };

  private readonly handleBlockDiceKept1 = (data: GameEventMap[typeof GameEventNames.BlockDiceKept]) => {
      const sprites = this.scene.playerSprites;
      const defender = sprites.get(data.defenderId);
      sprites
        .get(data.attackerId)
        ?.playAction(
          "block",
          defender ? { x: defender.x, y: defender.y } : undefined
        );
    };

  private readonly handlePlayerPushedIntoCrowd2 = (data: GameEventMap[typeof GameEventNames.PlayerPushedIntoCrowd]) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (!sprite) return;
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 350,
        onComplete: () => {
          sprite.setVisible(false);
          sprite.setAlpha(1);
          this.scene.refreshDugouts();
        },
      });
    };

  private readonly handlePlayerStatusChanged3 = (player: GameEventMap[typeof GameEventNames.PlayerStatusChanged]) => {
      const reconcile = () => {
        this.scene.reconcilePlayerLocation(player.id);

        this.scene.reconcileBallVisual();
      };
      const sprite = this.scene.playerSprites.get(player.id);

      if (sprite && player.gridPosition)
        void this.afterStep(sprite).then(reconcile);
      else reconcile();
    };

  private readonly handlePassFumbled4 = (data: GameEventMap[typeof GameEventNames.PassFumbled]) => {
      const acknowledge = () => {
        this.acknowledge(data.presentationId);
      };
      if (!this.scene.ballSprite) {
        acknowledge();
        return;
      }
      const target = this.scene.pitch.getPixelPosition(
        data.bouncePosition.x,
        data.bouncePosition.y
      );

      const moves = this.ballMoves;
      void (this.dice?.landed() ?? Promise.resolve())
        .then(() => {
          if (this.ballMoves !== moves) return;
          this.scene.placeBallVisual(data.position.x, data.position.y, 1);
          const ball = this.scene.ballSprite;
          return ball?.flyTo(target, { duration: 380, apex: 0.9 });
        })
        .then(() => new Promise((resolve) => setTimeout(resolve, 150)))
        .finally(acknowledge);
    };
}
