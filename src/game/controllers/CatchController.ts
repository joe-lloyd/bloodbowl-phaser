import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";

import { DiceController } from "./DiceController";

export interface CatchResult {
  success: boolean;
  roll: number;
  target: number;
  modifiers: number;
}

/**
 * CatchController - Handles Blood Bowl catch mechanics
 *
 * Responsible for:
 * - Executing Agility tests for catching balls
 * - Applying modifiers (bounce, throw-in, marking)
 * - Handling failed catches and ball bounces
 * - Auto-failing for Prone/Stunned/Distracted players
 */
export class CatchController {
  constructor(
    private eventBus: IEventBus,
    private diceController: DiceController
  ) {}

  /**
   * Calculate catch modifiers based on circumstances
   */
  public calculateModifiers(
    player: Player,
    position: { x: number; y: number },
    opponents: Player[],
    isBounce: boolean = false,
    isThrowIn: boolean = false,
    manualMarkingCount: number = 0
  ): number {
    let modifier = 0;

    if (isBounce || isThrowIn) {
      modifier -= 1;
    }

    // -1 per opponent marking the catcher
    const marking =
      opponents.length > 0
        ? this.countMarkingOpponents(position, opponents)
        : manualMarkingCount;
    modifier -= marking;

    // +1 for Accurate Pass (if not bounce/throw-in)
    // For now assuming caller handles accurate pass modifier or we add param.

    return modifier;
  }

  /**
   * Check if a player can attempt to catch
   * Prone, Stunned, or Distracted players auto-fail
   */
  public canAttemptCatch(player: Player): boolean {
    return (
      player.status === PlayerStatus.ACTIVE && !player.hasActed // Assuming 'Distracted' is tracked via hasActed or similar
    );
  }

  /**
   * Attempt to catch the ball
   */
  public attemptCatch(
    player: Player,
    position: { x: number; y: number },
    isBounce: boolean,
    isThrowIn: boolean,
    markingOpponents: number
  ): CatchResult {
    // Check if player can attempt catch
    if (!this.canAttemptCatch(player)) {
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: "Catch",
        diceType: "d6",
        value: 1,
        total: 1,
        description: `Catch (${player.playerName}): Auto-fail (${player.status})`,
        passed: false,
      });

      this.eventBus.emit(GameEventNames.CatchFailed, {
        playerId: player.id,
        position,
        reason: player.status,
      });

      return {
        success: false,
        roll: 1,
        target: player.stats.AG,
        modifiers: 0,
      };
    }

    const target = player.stats.AG;

    const modifiers = this.calculateModifiers(
      player,
      position,
      [], // Empty opponents list -> uses manual count
      isBounce,
      isThrowIn,
      markingOpponents // Pass the count directly
    );

    // Use centralized Dice Roll
    const result = this.diceController.rollSkillCheck(
      "Catch",
      target,
      modifiers,
      player.playerName
    );

    if (result.success) {
      this.eventBus.emit(GameEventNames.CatchSucceeded, {
        playerId: player.id,
        position,
      });
    } else {
      this.eventBus.emit(GameEventNames.CatchFailed, {
        playerId: player.id,
        position,
        reason: "Failed roll",
      });
    }

    return {
      success: result.success,
      roll: result.roll,
      target,
      modifiers,
    };
  }

  /**
   * Count marking opponents at a position
   */
  public countMarkingOpponents(
    position: { x: number; y: number },
    opponents: Player[]
  ): number {
    let count = 0;

    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE) {
        continue;
      }

      const dx = Math.abs(opponent.gridPosition.x - position.x);
      const dy = Math.abs(opponent.gridPosition.y - position.y);

      // Adjacent squares (tackle zone)
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        count++;
      }
    }

    return count;
  }
}
