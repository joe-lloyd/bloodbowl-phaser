import { Player, PlayerStatus } from "@/types/Player";
import { DiceController } from "./DiceController";

export interface DodgeResult {
  success: boolean;
  roll: number;
  target: number;
  modifiers: number;
}

export class DodgeController {
  constructor(private diceController: DiceController) {}

  public isDodgeRequired(
    from: { x: number; y: number },
    opponents: Player[]
  ): boolean {
    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE)
        continue;
      const dx = Math.abs(from.x - opponent.gridPosition.x);
      const dy = Math.abs(from.y - opponent.gridPosition.y);
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) return true;
    }
    return false;
  }

  public calculateDodgeModifiers(
    to: { x: number; y: number },
    opponents: Player[]
  ): number {
    let modifier = 0;
    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE)
        continue;
      const dx = Math.abs(to.x - opponent.gridPosition.x);
      const dy = Math.abs(to.y - opponent.gridPosition.y);
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) modifier -= 1;
    }
    return modifier;
  }

  public attemptDodge(
    player: Player,
    to: { x: number; y: number },
    opponents: Player[]
  ): DodgeResult {
    const target = player.stats.AG;
    const modifiers = this.calculateDodgeModifiers(to, opponents);
    const result = this.diceController.rollSkillCheck(
      "Dodge",
      target,
      modifiers,
      player.playerName
    );

    return {
      success: result.success,
      roll: result.roll,
      target,
      modifiers,
    };
  }
}
