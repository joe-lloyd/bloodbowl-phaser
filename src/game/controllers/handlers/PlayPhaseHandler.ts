import { PhaseHandler } from "./PhaseHandler";
import { GameScene } from "../../../scenes/GameScene";
import { IGameService } from "../../../services/interfaces/IGameService";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { moveAllowance } from "../../skills/movement";

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

    // Reroll/reaction dialog answers — resolve the paused roll path (or,
    // on the guest / online host, route the reply over the protocol)
    this.register(GameEventNames.UI_RerollResponse, (data) => {
      this.gameService.answerReroll(data.accept, data.source);
    });
    this.register(GameEventNames.UI_ReactionResponse, (data) => {
      this.gameService.answerReaction(data.accept);
    });

    // Push Follow Up Response — the follow-up move is free (no movement
    // cost, no dice), so it must NOT go through movePlayer
    this.register(GameEventNames.UI_FollowUpResponse, (data) => {
      if (data.followUp && data.targetSquare) {
        this.gameService.followUpPush(data.attackerId, data.targetSquare);
      }
      this.gameService.finishActivation(data.attackerId);
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
      const sprite = this.scene["playerSprites"].get(player.id);
      if (sprite) sprite.updateStatus();
      if (!player.gridPosition) this.scene.refreshDugouts();
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
