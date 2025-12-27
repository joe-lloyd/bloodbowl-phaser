import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";

export interface DodgeResult {
  success: boolean;
  roll: number;
  target: number;
  modifiers: number;
}

/**
 * DodgeController - Handles dodge mechanics for Blood Bowl
 *
 * Responsible for:
 * - Detecting when a dodge is required (leaving a tackle zone)
 * - Calculating dodge modifiers based on destination tackle zones
 * - Executing dodge rolls with proper Agility Tests
 * - Emitting dice roll events for UI feedback
 */
export class DodgeController {
  constructor(private eventBus: IEventBus) {}

  /**
   * Check if a dodge is required when moving from one square to another
   * A dodge is required when leaving a square that is in an opponent's tackle zone
   */
  public isDodgeRequired(
    from: { x: number; y: number },
    opponents: Player[]
  ): boolean {
    // Check if the 'from' square is in any opponent's tackle zone
    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE) {
        continue;
      }

      // Check if 'from' is adjacent to this opponent (in their tackle zone)
      const dx = Math.abs(from.x - opponent.gridPosition.x);
      const dy = Math.abs(from.y - opponent.gridPosition.y);

      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        return true; // In tackle zone, dodge required
      }
    }

    return false;
  }

  /**
   * Calculate dodge modifiers based on tackle zones in the destination square
   * Returns -1 for each opponent marking the destination
   */
  public calculateDodgeModifiers(
    to: { x: number; y: number },
    opponents: Player[]
  ): number {
    let modifier = 0;

    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE) {
        continue;
      }

      // Check if 'to' is adjacent to this opponent (in their tackle zone)
      const dx = Math.abs(to.x - opponent.gridPosition.x);
      const dy = Math.abs(to.y - opponent.gridPosition.y);

      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        modifier -= 1; // -1 for each opponent marking destination
      }
    }

    return modifier;
  }

  /**
   * Attempt a dodge roll
   * Returns the result including success/failure, roll value, target, and modifiers
   */
  public attemptDodge(
    player: Player,
    from: { x: number; y: number },
    to: { x: number; y: number },
    opponents: Player[]
  ): DodgeResult {
    const target = player.stats.AG;
    const modifiers = this.calculateDodgeModifiers(to, opponents);
    const roll = Math.floor(Math.random() * 6) + 1;

    // Success if roll + modifiers >= target
    // Note: In Blood Bowl, modifiers are applied to the target, not the roll
    // So a 3+ with -1 modifier means you need to roll 4+
    const effectiveTarget = target - modifiers;
    const success = roll >= effectiveTarget;

    // Emit dice roll event for UI
    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Dodge",
      diceType: "d6",
      value: roll,
      total: roll,
      description: `Dodge Roll (Target ${target}+, Modifier ${
        modifiers >= 0 ? "+" : ""
      }${modifiers}): ${success ? "Success" : "FAILURE"}`,
      passed: success,
    });

    return {
      success,
      roll,
      target,
      modifiers,
    };
  }
}
