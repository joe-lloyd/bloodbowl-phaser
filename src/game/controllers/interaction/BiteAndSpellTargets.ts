import type { InteractionScene, InteractionPitch, InteractionMarker } from "./ports";
import type { IGameService } from "@/services/interfaces/IGameService";
import type { Player } from "@/types/Player";
import type {
  BiteTargetDecisionRequest,
  InducementChoiceDecisionRequest,
  WizardSpell,
} from "@/types/decisions";
import { GameConfig } from "@/config/GameConfig";
import { getActiveOnlineMatch } from "@/network/OnlineMatch";
import {
  BITE_TARGET_LAYER,
} from "../../elements/Pitch";

const BITE_TARGET_COLOR = 0xef4444;

const SPELL_TARGET_COLOR = 0xf97316;

export class BiteAndSpellTargets {
  private biteTargetIds: string[] = [];
  private biteMarkers: InteractionMarker[] = [];

  private wizardSpell: WizardSpell | null = null;
  private spellMarkers: InteractionMarker[] = [];

  private readonly gameService: IGameService;
  private readonly scene: InteractionScene;
  private readonly pitch: InteractionPitch;
  private readonly playerAt: (x: number, y: number) => Player | null;
  constructor(
{ gameService,scene,pitch,playerAt }: { gameService: IGameService; scene: InteractionScene; pitch: InteractionPitch; playerAt: (x: number,y: number) => Player|null; }  ) {
    this.gameService = gameService;
    this.scene = scene;
    this.pitch = pitch;
    this.playerAt = playerAt;
  }

  private pendingBite(): BiteTargetDecisionRequest | null {
    const online = getActiveOnlineMatch();
    const pending = online
      ? online.pendingDecision()
      : this.gameService.getDecisionService().pending();
    return pending?.type === "bite-target" ? pending : null;
  }

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

      this.biteMarkers.push(
        this.pitch
          .highlightSquare({ x: square.x, y: square.y }, BITE_TARGET_COLOR)
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

  handleBiteTargetClick(playerId: string | undefined): boolean {
    if (this.biteTargetIds.length === 0) return false;

    if (!this.pendingBite()) {
      this.clearBiteTargets();
      return false;
    }
    if (!playerId || !this.biteTargetIds.includes(playerId)) return true;

    this.clearBiteTargets();
    this.gameService.answerBiteTarget(playerId);
    return true;
  }

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

  dropSpell(): void {
    this.wizardSpell = null;
    this.clearSpellMarkers();
  }

  private markSpellSquare(square: { x: number; y: number }): void {
    this.spellMarkers.push(
      this.pitch
        .highlightSquare({ x: square.x, y: square.y }, SPELL_TARGET_COLOR)
        .setName(BITE_TARGET_LAYER)
    );
  }

  private clearSpellMarkers(): void {
    for (const marker of this.spellMarkers) if (marker.scene) marker.destroy();
    this.spellMarkers = [];
  }

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
