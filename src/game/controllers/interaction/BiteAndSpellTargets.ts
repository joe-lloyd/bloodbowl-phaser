import type { GameScene } from "@/scenes/GameScene";
import type { IGameService } from "@/services/interfaces/IGameService";
import type { Player } from "@/types/Player";
import type {
  BiteTargetDecisionRequest,
  InducementChoiceDecisionRequest,
  WizardSpell,
} from "@/types/decisions";
import { GameConfig } from "@/config/GameConfig";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import { BITE_TARGET_LAYER, Pitch, SquareMarker } from "../../elements/Pitch";

/** The Thrall Linemen a failed Bloodlust may bite: ringed and marked red. */
const BITE_TARGET_COLOR = 0xef4444;
/** A Fireball's blast, and the players Zap! may pick. */
const SPELL_TARGET_COLOR = 0xf97316;

/**
 * Two picks a pitch click answers: the Thrall Linemen a failed Bloodlust may
 * bite, and the square or player a Sports-Wizard spell hits. Each is marked
 * on its own layer, so clearing the move and selection highlights keeps it.
 */
export class BiteAndSpellTargets {
  /**
   * A failed Bloodlust with two or more Thrall Linemen in reach: the ones
   * this coach may click to bite. Empty when no bite is being chosen here.
   * Like a push square, it is a mandatory pick: other clicks do nothing.
   */
  private biteTargetIds: string[] = [];
  private biteMarkers: SquareMarker[] = [];
  /** The Sports-Wizard spell whose target the next pitch click picks. */
  private wizardSpell: WizardSpell | null = null;
  private spellMarkers: SquareMarker[] = [];

  constructor(
    private readonly gameService: IGameService,
    private readonly scene: GameScene,
    private readonly pitch: Pitch,
    private readonly playerAt: (x: number, y: number) => Player | null
  ) {}

  /** The bite being chosen, if any: online the match's, else the engine's. */
  private pendingBite(): BiteTargetDecisionRequest | null {
    const online = getActiveOnlineMatch();
    const pending = online
      ? online.pendingDecision()
      : this.gameService.getDecisionService().pending();
    return pending?.type === "bite-target" ? pending : null;
  }

  /** Mark the bite the game waits on, if it waits on one. */
  markPendingBite(): void {
    const bite = this.pendingBite();
    if (bite) this.markBiteTargets(bite);
  }

  markBiteTargets(request: BiteTargetDecisionRequest): void {
    this.clearBiteTargets();
    const online = getActiveOnlineMatch();
    if (online && online.myTeamId !== request.chooserTeamId) return;
    this.biteTargetIds = [...request.targetIds];
    for (const id of this.biteTargetIds) {
      const square = this.gameService.getPlayerById(id)?.gridPosition;
      if (!square) continue;
      this.scene.highlightPlayer(id, BITE_TARGET_COLOR);
      // Its own layer, so clearing the move/selection highlights keeps it
      this.biteMarkers.push(
        this.pitch
          .highlightSquare(square.x, square.y, BITE_TARGET_COLOR)
          .setName(BITE_TARGET_LAYER)
      );
    }
  }

  clearBiteTargets(): void {
    for (const id of this.biteTargetIds) this.scene.unhighlightPlayer(id);
    for (const marker of this.biteMarkers) if (marker.scene) marker.destroy();
    this.biteTargetIds = [];
    this.biteMarkers = [];
  }

  /**
   * Route a click while a bite is being chosen: a marked Thrall is bitten,
   * anything else is ignored. False when no bite is being chosen here.
   */
  handleBiteTargetClick(playerId: string | undefined): boolean {
    if (this.biteTargetIds.length === 0) return false;
    // Gone without a resolve (state replaced): the board is free again
    if (!this.pendingBite()) {
      this.clearBiteTargets();
      return false;
    }
    if (!playerId || !this.biteTargetIds.includes(playerId)) return true;
    // Clear first: online, the answer is only pending until it comes back,
    // and a second click (sprite and square both report it) must not resend
    this.clearBiteTargets();
    this.gameService.answerBiteTarget(playerId);
    return true;
  }

  /** The Sports-Wizard offer waiting on this coach, if any. */
  private pendingSpell(): InducementChoiceDecisionRequest | null {
    const online = getActiveOnlineMatch();
    const pending = online
      ? online.pendingDecision()
      : this.gameService.getDecisionService().pending();
    return pending?.type === "inducement-choice" &&
      pending.kind === "sports-wizard"
      ? pending
      : null;
  }

  /** The dialog picked a spell, or went back: aim it with the pitch. */
  aimSpell(spell: WizardSpell | null): void {
    this.wizardSpell = spell;
    this.clearSpellMarkers();
    const pending = this.pendingSpell();
    if (spell !== "zap" || !pending) return;
    for (const id of pending.playerIds) {
      const square = this.gameService.getPlayerById(id)?.gridPosition;
      if (square) this.markSpellSquare(square);
    }
  }

  /** The spell offer was answered, here or by the other coach. */
  dropSpell(): void {
    this.wizardSpell = null;
    this.clearSpellMarkers();
  }

  private markSpellSquare(square: { x: number; y: number }): void {
    this.spellMarkers.push(
      this.pitch
        .highlightSquare(square.x, square.y, SPELL_TARGET_COLOR)
        .setName(BITE_TARGET_LAYER)
    );
  }

  private clearSpellMarkers(): void {
    for (const marker of this.spellMarkers) if (marker.scene) marker.destroy();
    this.spellMarkers = [];
  }

  /** Fireball shows its blast, the square and its eight neighbours. */
  previewFireball(x: number, y: number): void {
    if (this.wizardSpell !== "fireball") return;
    this.clearSpellMarkers();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const square = { x: x + dx, y: y + dy };
        if (
          square.x >= 0 &&
          square.y >= 0 &&
          square.x < GameConfig.PITCH_WIDTH &&
          square.y < GameConfig.PITCH_HEIGHT
        )
          this.markSpellSquare(square);
      }
  }

  /**
   * Route a click while a spell is aimed: Fireball takes the square, Zap!
   * an offered player. False when no spell is being aimed here.
   */
  handleSpellClick(x: number, y: number): boolean {
    const spell = this.wizardSpell;
    if (!spell) return false;
    if (!this.pendingSpell()) {
      this.dropSpell();
      return false;
    }
    if (spell === "fireball") {
      this.gameService.answerInducementChoice({ spell, square: { x, y } });
    } else {
      const target = this.playerAt(x, y);
      if (!target) return true;
      this.gameService.answerInducementChoice({ spell, playerId: target.id });
    }
    return true;
  }
}
