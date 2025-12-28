import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";

export type PassType = "Quick Pass" | "Short Pass" | "Long Pass" | "Long Bomb";

export interface PassRange {
  type: PassType;
  modifier: number;
  minDistance: number;
  maxDistance: number;
}

export interface PassResult {
  success: boolean;
  accurate: boolean;
  fumbled: boolean;
  roll: number;
  target: number;
  modifiers: number;
  passType: PassType;
  finalPosition: { x: number; y: number };
}

export interface InterceptionAttempt {
  playerId: string;
  position: { x: number; y: number };
  modifier: number;
}

/**
 * ThrowController - Handles Blood Bowl pass actions
 *
 * Implements the 5-step pass action process:
 * 1. Declare Target Square
 * 2. Measure Range
 * 3. Test for Accuracy
 * 4. Interceptions
 * 5. Resolve Pass Action
 */
export class ThrowController {
  // Pass range definitions based on Blood Bowl rulebook
  private static readonly PASS_RANGES: PassRange[] = [
    { type: "Quick Pass", modifier: 0, minDistance: 0, maxDistance: 3 },
    { type: "Short Pass", modifier: -1, minDistance: 4, maxDistance: 6 },
    { type: "Long Pass", modifier: -2, minDistance: 7, maxDistance: 10 },
    { type: "Long Bomb", modifier: -3, minDistance: 11, maxDistance: 999 },
  ];

  constructor(private eventBus: IEventBus) {}

  /**
   * Calculate the distance between two grid positions
   * Uses the maximum of horizontal and vertical distance (Chebyshev distance)
   */
  private calculateDistance(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): number {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    return Math.max(dx, dy);
  }

  /**
   * Measure the range and determine pass type
   */
  public measureRange(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): PassRange {
    const distance = this.calculateDistance(from, to);

    for (const range of ThrowController.PASS_RANGES) {
      if (distance >= range.minDistance && distance <= range.maxDistance) {
        return range;
      }
    }

    // Default to Long Bomb if beyond all ranges
    return ThrowController.PASS_RANGES[3];
  }

  /**
   * Calculate modifiers for the pass attempt
   */
  private calculatePassModifiers(
    passRange: PassRange,
    markingOpponents: number
  ): number {
    let modifier = passRange.modifier;
    modifier -= markingOpponents; // -1 per opponent marking the thrower
    return modifier;
  }

  /**
   * Test for accuracy - Passing Ability test
   */
  public testAccuracy(
    player: Player,
    passRange: PassRange,
    markingOpponents: number
  ): { success: boolean; accurate: boolean; fumbled: boolean; roll: number } {
    const target = player.stats.PA;
    const modifiers = this.calculatePassModifiers(passRange, markingOpponents);
    const roll = Math.floor(Math.random() * 6) + 1;

    // Natural 6 is always accurate
    if (roll === 6) {
      return { success: true, accurate: true, fumbled: false, roll };
    }

    // Natural 1 is always fumbled
    if (roll === 1) {
      return { success: false, accurate: false, fumbled: true, roll };
    }

    // Check if roll + modifiers >= target
    const effectiveRoll = roll + modifiers;
    const accurate = effectiveRoll >= target;

    // Fumbled if 1 after modifiers (even if not natural 1)
    const fumbled = effectiveRoll <= 1;

    return {
      success: accurate || fumbled === false,
      accurate,
      fumbled,
      roll,
    };
  }

  /**
   * Calculate scatter direction and apply to position
   */
  private scatterBall(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    const direction = Math.floor(Math.random() * 8) + 1; // 1-8

    let dx = 0;
    let dy = 0;

    // Scatter directions (1: TL, 2: T, 3: TR, 4: L, 5: R, 6: BL, 7: B, 8: BR)
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

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Pass Scatter",
      diceType: "d8",
      value: direction,
      total: direction,
      description: `Scatter Direction: ${direction}`,
      passed: true,
    });

    return {
      x: Math.max(0, Math.min(25, position.x + dx)),
      y: Math.max(0, Math.min(14, position.y + dy)),
    };
  }

  /**
   * Attempt a pass action
   */
  public attemptPass(
    player: Player,
    from: { x: number; y: number },
    to: { x: number; y: number },
    markingOpponents: number
  ): PassResult {
    // Step 2: Measure Range
    const passRange = this.measureRange(from, to);

    // Step 3: Test for Accuracy
    const accuracyTest = this.testAccuracy(player, passRange, markingOpponents);

    const target = player.stats.PA;
    const modifiers = this.calculatePassModifiers(passRange, markingOpponents);

    // Emit dice roll event
    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Pass",
      diceType: "d6",
      value: accuracyTest.roll,
      total: accuracyTest.roll + modifiers,
      description: `${passRange.type} (Target ${target}+, Modifier ${
        modifiers >= 0 ? "+" : ""
      }${modifiers}): ${
        accuracyTest.fumbled
          ? "FUMBLED"
          : accuracyTest.accurate
          ? "Accurate"
          : "Inaccurate"
      }`,
      passed: accuracyTest.accurate,
    });

    let finalPosition = { ...to };

    // Handle fumbled pass
    if (accuracyTest.fumbled) {
      // Ball bounces from thrower's square
      finalPosition = this.scatterBall(from);

      this.eventBus.emit(GameEventNames.PassFumbled, {
        playerId: player.id,
        position: from,
        bouncePosition: finalPosition,
      });
    }
    // Handle inaccurate pass
    else if (!accuracyTest.accurate) {
      // Ball scatters from target square
      finalPosition = this.scatterBall(to);

      this.eventBus.emit(GameEventNames.PassAttempted, {
        playerId: player.id,
        from,
        to,
        passType: passRange.type,
        accurate: false,
        finalPosition,
      });
    }
    // Handle accurate pass
    else {
      this.eventBus.emit(GameEventNames.PassAttempted, {
        playerId: player.id,
        from,
        to,
        passType: passRange.type,
        accurate: true,
        finalPosition,
      });
    }

    return {
      success: !accuracyTest.fumbled,
      accurate: accuracyTest.accurate,
      fumbled: accuracyTest.fumbled,
      roll: accuracyTest.roll,
      target,
      modifiers,
      passType: passRange.type,
      finalPosition,
    };
  }

  /**
   * Check for potential interceptors along the pass path
   */
  public checkInterceptions(
    from: { x: number; y: number },
    to: { x: number; y: number },
    opponents: Player[],
    isAccurate: boolean
  ): InterceptionAttempt[] {
    const interceptors: InterceptionAttempt[] = [];
    const distance = this.calculateDistance(from, to);

    // Check each opponent
    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE) {
        continue;
      }

      // Check if opponent is along the pass path
      // Using simple distance check - opponent must be within range ruler path
      const distFromStart = this.calculateDistance(from, opponent.gridPosition);
      const distToEnd = this.calculateDistance(opponent.gridPosition, to);

      // If opponent is roughly on the line (distance to start + distance to end ≈ total distance)
      if (distFromStart + distToEnd <= distance + 1) {
        const modifier = isAccurate ? -3 : -2;

        interceptors.push({
          playerId: opponent.id,
          position: opponent.gridPosition,
          modifier,
        });
      }
    }

    return interceptors;
  }

  /**
   * Attempt an interception
   */
  public attemptInterception(
    player: Player,
    modifier: number,
    markingOpponents: number
  ): boolean {
    const target = player.stats.AG;
    const totalModifier = modifier - markingOpponents;
    const roll = Math.floor(Math.random() * 6) + 1;

    // Natural 6 always succeeds
    if (roll === 6) {
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: "Interception",
        diceType: "d6",
        value: roll,
        total: roll,
        description: `Interception (Target ${target}+, Modifier ${
          totalModifier >= 0 ? "+" : ""
        }${totalModifier}): SUCCESS (Natural 6)`,
        passed: true,
      });
      return true;
    }

    const effectiveRoll = roll + totalModifier;
    const success = effectiveRoll >= target;

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Interception",
      diceType: "d6",
      value: roll,
      total: effectiveRoll,
      description: `Interception (Target ${target}+, Modifier ${
        totalModifier >= 0 ? "+" : ""
      }${totalModifier}): ${success ? "SUCCESS" : "Failed"}`,
      passed: success,
    });

    return success;
  }

  /**
   * Get all squares within a specific pass range type
   */
  public getSquaresInRange(
    from: { x: number; y: number },
    passType: PassType
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    const range = ThrowController.PASS_RANGES.find((r) => r.type === passType);

    if (!range) return squares;

    // Check all squares on the pitch
    for (let x = 0; x < 26; x++) {
      for (let y = 0; y < 15; y++) {
        const distance = this.calculateDistance(from, { x, y });
        if (distance >= range.minDistance && distance <= range.maxDistance) {
          squares.push({ x, y });
        }
      }
    }

    return squares;
  }

  /**
   * Get all pass ranges from a position
   */
  public getAllRanges(from: {
    x: number;
    y: number;
  }): Map<PassType, { x: number; y: number }[]> {
    const ranges = new Map<PassType, { x: number; y: number }[]>();

    for (const passRange of ThrowController.PASS_RANGES) {
      ranges.set(passRange.type, this.getSquaresInRange(from, passRange.type));
    }

    return ranges;
  }
}
