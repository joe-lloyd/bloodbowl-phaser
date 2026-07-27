import Phaser from "phaser";
import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { GameEventMap, IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { moveAllowance } from "../../skills/movement";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { BombSprite } from "../../elements/BombSprite";
import { GameConfig } from "../../../config/GameConfig";

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
  /** Blitz block awaiting the rush confirmation dialog */
  private pendingBlitzBlock: {
    attackerId: string;
    defenderId: string;
    numDice: number;
    isAttackerChoice: boolean;
  } | null = null;

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

    // Throw / Kick Team-mate: the thrower leans into a throw or swings a kick.
    this.register(GameEventNames.PlayerThrowGesture, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (!sprite) return;
      if (data.mode === "kick") {
        sprite.animateKickGesture(data.dir);
      } else {
        sprite.animateThrowGesture(data.dir);
      }
    });

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

    // Punt Declared - kick gesture + ball flight, then acknowledge so the
    // paused PuntOperation resolves the (already rolled) outcome.
    this.register(GameEventNames.PuntDeclared, (data) =>
      this.handlePuntDeclaration(data)
    );

    // Bombardier: arc a bomb to its landing square, then blow it up.
    this.register(GameEventNames.BombThrown, (data) =>
      this.handleBombThrow(data)
    );
    this.register(GameEventNames.BombExploded, (data) =>
      this.handleBombExplosion(data)
    );

    // --- MISSING HANDLERS RESTORED ---

    // --- MISSING HANDLERS RESTORED ---
    // Kickoff logic moved to KickoffPhaseHandler

    // Ready To Start (Kickoff -> Play)
    // REMOVED from PlayPhase, handled in KickoffPhase transition

    // Block Dice. The block at the end of a Blitz costs 1 movement; if that
    // point is beyond MA it's a Rush — ask the usual rush confirmation
    // BEFORE any dice are rolled (declining keeps the activation open).
    this.register(GameEventNames.UI_RollBlockDice, (data) => {
      const state = this.gameService.getState();
      const attacker = this.gameService.getPlayerById(data.attackerId);
      const isBlitzBlock =
        state.activePlayer?.action === "blitz" &&
        state.activePlayer.id === data.attackerId;

      if (isBlitzBlock && attacker) {
        const used = this.gameService.getMovementUsed(data.attackerId);
        if (used + 1 > moveAllowance(attacker)) {
          // Even a Rush can't pay for the block any more
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "No movement left to make the Blitz block!"
          );
          this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
          return;
        }
        if (used + 1 > attacker.stats.MA) {
          this.pendingBlitzBlock = data;
          this.eventBus.emit(GameEventNames.UI_RequestConfirmation, {
            actionId: "blitz-rush-confirm",
            title: "Rush Required!",
            message:
              `The Blitz block costs 1 movement beyond ${attacker.playerName}'s MA.\n` +
              `Rush (GFI): 2+ — failure knocks them down in front of the target (turnover, no block).\n\n` +
              `Rush to throw the block?`,
            confirmLabel: "Rush!",
            cancelLabel: "Cancel",
            risky: true,
          });
          return;
        }
      }

      this.gameService.rollBlockDice(
        data.attackerId,
        data.defenderId,
        data.numDice,
        data.isAttackerChoice
      );
    });

    this.register(GameEventNames.UI_ConfirmationResult, (data) => {
      if (data.actionId !== "blitz-rush-confirm") return;
      const pending = this.pendingBlitzBlock;
      this.pendingBlitzBlock = null;
      if (data.confirmed && pending) {
        this.gameService.rollBlockDice(
          pending.attackerId,
          pending.defenderId,
          pending.numDice,
          pending.isAttackerChoice
        );
      } else {
        // Rush declined: no dice will come — stop the dialog's rolling state
        this.eventBus.emit(GameEventNames.UI_BlockRollCancelled);
      }
    });

    // Block Result Selected
    this.register(GameEventNames.UI_BlockResultSelected, (data) => {
      this.gameService.resolveBlock(
        data.attackerId,
        data.defenderId,
        data.result
      );
    });

    // Block-dice re-rolls (Team Re-roll = all dice, Pro = one die). Both
    // re-emit BlockDiceRolled, so the dialog refreshes in place.
    this.register(GameEventNames.UI_TeamRerollBlock, (data) => {
      this.gameService.teamRerollBlock(data.attackerId);
    });
    this.register(GameEventNames.UI_ProRerollBlockDie, (data) => {
      this.gameService.proRerollBlockDie(data.attackerId, data.dieIndex);
    });

    // Reroll/reaction dialog answers — resolve the paused roll path (or,
    // on the guest / online host, route the reply over the protocol)
    this.register(GameEventNames.UI_RerollResponse, (data) => {
      this.gameService.answerReroll(data.accept, data.source);
    });
    this.register(GameEventNames.UI_ReactionResponse, (data) => {
      this.gameService.answerReaction(data.accept);
    });
    this.register(GameEventNames.UI_InterceptionResponse, (data) => {
      this.gameService.answerInterception(data.playerId);
    });
    this.register(GameEventNames.UI_ApothecaryResponse, (data) => {
      this.gameService.answerApothecary(data.accept);
    });

    // Push Follow Up Response — the follow-up move is free (no movement
    // cost, no dice), so it must NOT go through movePlayer
    this.register(GameEventNames.UI_FollowUpResponse, async (data) => {
      if (data.followUp && data.targetSquare) {
        await this.gameService.followUpPush(data.attackerId, data.targetSquare);
      }
      // A Blitz block keeps the player active with the rest of their move;
      // a plain block ends the activation.
      this.gameService.finishBlockActivation(data.attackerId);
      // hasUsedBlitzBlock is true ONLY when a Blitz block kept the player
      // active (a plain block, or a Blitz that spent its last movement,
      // clears it) — the precise signal to resume the move.
      if (
        !getActiveOnlineMatch() &&
        this.gameService.hasUsedBlitzBlock(data.attackerId)
      ) {
        this.eventBus.emit(GameEventNames.UI_ResumeBlitzMove, {
          playerId: data.attackerId,
        });
      }
    });

    // Status Updates
    this.register(GameEventNames.PlayerKnockedDown, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) sprite.updateStatus();
    });

    // Crowd surf: the surfed player must leave the pitch NOW. Their sprite
    // used to disappear only via the turn-end dugout refresh, but the
    // follow-up prompt keeps the activation (and turn) open, so without
    // this the "pushed out" player visibly stayed on their square.
    this.register(GameEventNames.PlayerPushedIntoCrowd, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (!sprite) return;
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 350,
        onComplete: () => {
          sprite.setVisible(false);
          sprite.setAlpha(1); // ready for re-use next drive
          this.scene.refreshDugouts();
        },
      });
    });

    // Keep the sprite's look in sync with any status flip (stunned → prone
    // at turn start, crowd-injury results, …). Off-pitch changes also move
    // the player between dugout boxes — but only those trigger the full
    // refresh: refreshing on on-pitch changes would snap every sprite to
    // its grid square and teleport a mid-animation mover.
    this.register(GameEventNames.PlayerStatusChanged, (player) => {
      // One owner decides whether this player is still represented on the
      // pitch or belongs to a dugout box (KO, casualty, sent off).
      this.scene.reconcilePlayerLocation(player.id);
      // A player who just left the pitch may have been standing on the ball.
      this.scene.reconcileBallVisual();
    });

    this.register(GameEventNames.PlayerStoodUp, (data) => {
      const sprite = this.scene["playerSprites"].get(data.playerId);
      if (sprite) sprite.updateStatus();
    });

    // Ball possession is one mutually exclusive visual state: reconcile from
    // canonical state instead of imperatively moving a sprite per event.
    this.register(GameEventNames.BallPlaced, () => {
      this.scene.reconcileBallVisual();
    });

    // A mid-route pickup (success or failure) decides possession before the
    // rest of the route resolves — re-derive the loose ball / carrier marker.
    this.register(GameEventNames.BallPickup, () => {
      this.scene.reconcileBallVisual();
    });

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

        // If the mover carries the ball, walk it along with them instead of
        // letting the BallPlaced teleport leave it at the destination. The
        // engine says exactly where the ball joined (start square, or the
        // pickup square mid-path) so the ball never jumps to a square it
        // was never on.
        if (data.ballFrom && data.ballPath && data.ballPath.length > 0) {
          this.scene.animateBallAlong(
            data.ballFrom,
            data.ballPath,
            (data.ballJoinStep || 0) * 180
          );
        }

        const flight = data.thrown
          ? sprite.animateThrow(pixelPath)
          : sprite.animateMovement(pixelPath);
        flight.then(() => {
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

  /**
   * Present a declared Punt: the punter swings a kick and the ball flies to
   * the resolved landing square. The operation is parked on this animation, so
   * the acknowledgement must fire on every path (including "no sprite yet").
   */
  private handlePuntDeclaration(
    data: GameEventMap[GameEventNames.PuntDeclared]
  ): void {
    const acknowledge = () =>
      this.eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: data.presentationId,
      });

    this.scene["playerSprites"]
      .get(data.playerId)
      ?.animateKickGesture(Math.sign(data.direction.x) || 1);

    const ballSprite = this.scene["ballSprite"];
    const pitch = this.scene["pitch"];
    if (!ballSprite || !pitch) {
      acknowledge();
      return;
    }

    const target = pitch.getPixelPosition(data.landing.x, data.landing.y);
    this.scene.tweens.add({
      targets: ballSprite,
      x: target.x,
      y: target.y,
      duration: 500,
      ease: "Quad.easeOut",
      onComplete: acknowledge,
    });
  }

  /** Arc a transient BombSprite from the Bomber's square to where it lands. */
  private handleBombThrow(data: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  }): void {
    const pitch = this.scene["pitch"];
    if (!pitch) return;
    const p0 = pitch.getPixelPosition(data.from.x, data.from.y);
    const p1 = pitch.getPixelPosition(data.to.x, data.to.y);

    const bomb = new BombSprite(this.scene, p0.x, p0.y);
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
        bomb.y = Phaser.Math.Linear(p0.y, p1.y, t) - arc * Math.sin(Math.PI * t);
        bomb.rotation += 0.18;
      },
      onComplete: () => bomb.destroy(),
    });
  }

  /**
   * A blast over the landing square and its eight neighbours: a translucent
   * 3×3 flash plus an expanding fireball that fades out.
   */
  private handleBombExplosion(data: { x: number; y: number }): void {
    const pitch = this.scene["pitch"];
    if (!pitch) return;
    const centre = pitch.getPixelPosition(data.x, data.y);
    const s = GameConfig.SQUARE_SIZE;

    // 3×3 area flash — literally the square and its neighbours.
    const area = this.scene.add.graphics();
    area.setDepth(129);
    area.fillStyle(0xff7722, 0.35);
    area.fillRect(centre.x - s * 1.5, centre.y - s * 1.5, s * 3, s * 3);
    this.scene.tweens.add({
      targets: area,
      alpha: 0,
      duration: 550,
      ease: "Quad.easeOut",
      onComplete: () => area.destroy(),
    });

    // Expanding fireball, layered hot-to-cool.
    const fireball = this.scene.add.graphics();
    fireball.setDepth(131);
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
      onComplete: () => fireball.destroy(),
    });

    if (this.scene.cameras?.main) {
      this.scene.cameras.main.shake(220, 0.006);
    }
  }
}
