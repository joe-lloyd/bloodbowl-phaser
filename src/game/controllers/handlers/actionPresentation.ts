import type { KickoffScene } from "./scenePorts";
import { type GameEventMap, type IEventBus } from "../../../services/EventBus";
import { scopeEventBus } from "../../../services/scopedEventBus";
import { GameEventNames } from "../../../types/events";
import { DiceWatch } from "../../presentation/diceWatch";

export function facingDirection(dx: number): number {
  const direction = Math.sign(dx);
  return direction === 0 || Number.isNaN(direction) ? 1 : direction;
}

type ActionScene = Pick<
  KickoffScene,
  "playerSprites" | "tweens" | "refreshDugouts" | "animateBallAlong"
> & { pitch: Pick<KickoffScene["pitch"], "getPixelPosition"> };

export class ActionPresentation {
  private readonly scene: ActionScene;
  private readonly eventBus: IEventBus;
  private readonly dice: DiceWatch;
  private readonly disposeHandlers: () => void;

  constructor(scene: ActionScene, eventBus: IEventBus) {
    this.scene = scene;
    this.eventBus = eventBus;
    this.dice = new DiceWatch(eventBus);
    const subscriptions = scopeEventBus(eventBus);
    this.disposeHandlers = () => {
      subscriptions.dispose();
    };
    subscriptions.on(GameEventNames.PlayerMoved, (data) => {
      this.handlePlayerMove(data);
    });
    subscriptions.on(GameEventNames.PlayerThrowGesture, this.onThrowGesture);
    subscriptions.on(GameEventNames.BlockDiceKept, this.onBlockDiceKept);
    subscriptions.on(GameEventNames.PlayerPushedIntoCrowd, this.onPushedIntoCrowd);
    subscriptions.on(GameEventNames.PlayerKnockedDown, (data) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (sprite)
        void this.afterStep(sprite).then(() => {
          sprite.updateStatus();
        });
    });
    subscriptions.on(GameEventNames.PlayerStoodUp, (data) => {
      this.scene.playerSprites.get(data.playerId)?.updateStatus();
    });
  }

  dispose(): void {
    this.disposeHandlers();
    this.dice.dispose();
  }

  diceLanded(): Promise<void> {
    return this.dice.landed();
  }

  async afterStep(sprite: { motion: Promise<void> }): Promise<void> {
    await this.dice.landed();
    await sprite.motion;
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
      .then(() => this.dice.landed())
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

  private readonly onThrowGesture = (data: GameEventMap[typeof GameEventNames.PlayerThrowGesture]) => {
      const sprite = this.scene.playerSprites.get(data.playerId);
      if (!sprite) return;
      if (data.mode === "kick") {
        sprite.animateKickGesture(data.dir);
      } else {
        sprite.animateThrowGesture(data.dir);
      }
    };

  private readonly onBlockDiceKept = (data: GameEventMap[typeof GameEventNames.BlockDiceKept]) => {
      const sprites = this.scene.playerSprites;
      const defender = sprites.get(data.defenderId);
      sprites
        .get(data.attackerId)
        ?.playAction(
          "block",
          defender ? { x: defender.x, y: defender.y } : undefined
        );
    };

  private readonly onPushedIntoCrowd = (data: GameEventMap[typeof GameEventNames.PlayerPushedIntoCrowd]) => {
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
}
