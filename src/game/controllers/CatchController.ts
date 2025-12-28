import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";

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
  constructor(private eventBus: IEventBus) {}

  /**
   * Calculate catch modifiers based on circumstances
   */
  private calculateCatchModifiers(
    isBounce: boolean,
    isThrowIn: boolean,
    markingOpponents: number
  ): number {
    let modifier = 0;

    if (isBounce || isThrowIn) {
      modifier -= 1;
    }

    // -1 per opponent marking the catcher
    modifier -= markingOpponents;

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
    const modifiers = this.calculateCatchModifiers(
      isBounce,
      isThrowIn,
      markingOpponents
    );
    const roll = Math.floor(Math.random() * 6) + 1;

    // Natural 6 always succeeds
    if (roll === 6) {
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: "Catch",
        diceType: "d6",
        value: roll,
        total: roll,
        description: `Catch (${player.playerName}): SUCCESS (Natural 6)`,
        passed: true,
      });

      this.eventBus.emit(GameEventNames.CatchSucceeded, {
        playerId: player.id,
        position,
      });

      return {
        success: true,
        roll,
        target,
        modifiers,
      };
    }

    // Natural 1 always fails
    if (roll === 1) {
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: "Catch",
        diceType: "d6",
        value: roll,
        total: roll,
        description: `Catch (${player.playerName}): FAILED (Natural 1)`,
        passed: false,
      });

      this.eventBus.emit(GameEventNames.CatchFailed, {
        playerId: player.id,
        position,
        reason: "Natural 1",
      });

      return {
        success: false,
        roll,
        target,
        modifiers,
      };
    }

    // Check if roll + modifiers >= target
    const effectiveRoll = roll + modifiers;
    const success = effectiveRoll >= target;

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Catch",
      diceType: "d6",
      value: roll,
      total: effectiveRoll,
      description: `Catch (${player.playerName}, Target ${target}+, Modifier ${
        modifiers >= 0 ? "+" : ""
      }${modifiers}): ${success ? "SUCCESS" : "FAILED"}`,
      passed: success,
    });

    if (success) {
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
      success,
      roll,
      target,
      modifiers,
    };
  }

  /**
   * Handle a failed catch - ball bounces
   */
  public handleFailedCatch(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    // Ball bounces in a random direction
    const direction = Math.floor(Math.random() * 8) + 1;

    let dx = 0;
    let dy = 0;

    switch (direction) {
      case 1:
        dx = -1;
        dy = -1;
        break;
      case 2:
        dx = 0;
        dy = -1;
        break;
      case 3:
        dx = 1;
        dy = -1;
        break;
      case 4:
        dx = -1;
        dy = 0;
        break;
      case 5:
        dx = 1;
        dy = 0;
        break;
      case 6:
        dx = -1;
        dy = 1;
        break;
      case 7:
        dx = 0;
        dy = 1;
        break;
      case 8:
        dx = 1;
        dy = 1;
        break;
    }

    const bouncePosition = {
      x: Math.max(0, Math.min(25, position.x + dx)),
      y: Math.max(0, Math.min(14, position.y + dy)),
    };

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Bounce",
      diceType: "d8",
      value: direction,
      total: direction,
      description: `Ball Bounce Direction: ${direction}`,
      passed: true,
    });

    this.eventBus.emit(GameEventNames.BallScattered, {
      from: position,
      to: bouncePosition,
      reason: "Failed catch",
    });

    return bouncePosition;
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
