import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { BallMovementController } from "./BallMovementController";

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
  scatterPath?: { x: number; y: number }[]; // For inaccurate passes
}

export interface InterceptionAttempt {
  playerId: string;
  position: { x: number; y: number };
  modifier: number;
}

/**
 * PassController - Handles Blood Bowl pass actions
 *
 * Implements the pass action process:
 * 1. Measure Range
 * 2. Test for Accuracy
 * 3. Resolve Pass Action (Scatter/Bounce/Catch)
 */
export class PassController {
  // Pass range definitions based on Blood Bowl rulebook
  private static readonly PASS_RANGES: PassRange[] = [
    { type: "Quick Pass", modifier: 0, minDistance: 0, maxDistance: 3 },
    { type: "Short Pass", modifier: -1, minDistance: 4, maxDistance: 6 },
    { type: "Long Pass", modifier: -2, minDistance: 7, maxDistance: 10 },
    { type: "Long Bomb", modifier: -3, minDistance: 11, maxDistance: 999 },
  ];

  constructor(
    private eventBus: IEventBus,
    private movementController: BallMovementController
  ) {}

  /**
   * Calculate the distance between two grid positions
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

    for (const range of PassController.PASS_RANGES) {
      if (distance >= range.minDistance && distance <= range.maxDistance) {
        return range;
      }
    }

    return PassController.PASS_RANGES[3];
  }

  private calculatePassModifiers(
    passRange: PassRange,
    markingOpponents: number
  ): number {
    let modifier = passRange.modifier;
    modifier -= markingOpponents;
    return modifier;
  }

  public testAccuracy(
    player: Player,
    passRange: PassRange,
    markingOpponents: number
  ): { success: boolean; accurate: boolean; fumbled: boolean; roll: number } {
    const target = player.stats.PA;
    const modifiers = this.calculatePassModifiers(passRange, markingOpponents);
    const roll = Math.floor(Math.random() * 6) + 1;

    if (roll === 6) {
      return { success: true, accurate: true, fumbled: false, roll };
    }
    if (roll === 1) {
      return { success: false, accurate: false, fumbled: true, roll };
    }

    const effectiveRoll = roll + modifiers;
    const accurate = effectiveRoll >= target;
    const fumbled = effectiveRoll <= 1;

    return {
      success: accurate || fumbled === false,
      accurate,
      fumbled,
      roll,
    };
  }

  /**
   * Scatter the ball (Delegated to Movement Controller)
   */
  public scatterBall(
    position: { x: number; y: number },
    _emitEvent: boolean = true // Argument deprecated but kept for signature comp if needed
  ): { x: number; y: number } {
    // Note: MovementController.scatter returns a PATH (3 steps).
    // Internal loose scatter usually implies 1 step (like bounce).
    // If we want 1 step scatter we use bounce logic or expose step in controller.
    // For legacy support let's assume this means "Bounce/Scatter 1 square"
    return this.movementController!.bounce(position);
  }

  /**
   * Bounce the ball (Delegated)
   */
  public bounceBall(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return this.movementController!.bounce(position);
  }

  /**
   * Attempt to catch the ball
   */
  public attemptCatch(
    player: Player,
    isAccuratePass: boolean,
    markingOpponents: number
  ): { success: boolean; roll: number } {
    const target = player.stats.AG;
    let modifier = isAccuratePass ? 1 : 0;
    modifier -= markingOpponents;

    const roll = Math.floor(Math.random() * 6) + 1;
    const success = roll === 6 || (roll !== 1 && roll + modifier >= target);

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Agility (Catch)",
      diceType: "d6",
      value: roll,
      total: roll + modifier,
      description: `Catch (Target ${target}+, Mod ${modifier}): ${success ? "SUCCESS" : "FAIL"}`,
      passed: success,
    });

    return { success, roll };
  }

  public attemptPass(
    player: Player,
    from: { x: number; y: number },
    to: { x: number; y: number },
    markingOpponents: number
  ): PassResult {
    const passRange = this.measureRange(from, to);
    const accuracyTest = this.testAccuracy(player, passRange, markingOpponents);
    const target = player.stats.PA;
    const modifiers = this.calculatePassModifiers(passRange, markingOpponents);

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Pass",
      diceType: "d6",
      value: accuracyTest.roll,
      total: accuracyTest.roll + modifiers,
      description: `${passRange.type} (Target ${target}+, Modifier ${modifiers >= 0 ? "+" : ""}${modifiers}): ${
        accuracyTest.fumbled
          ? "FUMBLED"
          : accuracyTest.accurate
            ? "Accurate"
            : "Inaccurate"
      }`,
      passed: accuracyTest.accurate,
    });

    let finalPosition = { ...to };
    let scatterPath: { x: number; y: number }[] | undefined;

    if (accuracyTest.fumbled) {
      // Fumbled: Ball stays in passer's square initially, then BounceOperation handles the bounce.
      // We do NOT scatter here to avoid double-rolling.
      finalPosition = { ...from };
      this.eventBus.emit(GameEventNames.PassFumbled, {
        playerId: player.id,
        position: from,
        bouncePosition: finalPosition, // Same as from, bounce happens next
      });
    } else if (!accuracyTest.accurate) {
      // Inaccurate: Scatter 3 times (Batched)
      const path = this.movementController!.scatter(to);
      scatterPath = [to, ...path];
      finalPosition = path[path.length - 1];

      this.eventBus.emit(GameEventNames.PassAttempted, {
        playerId: player.id,
        from,
        to,
        passType: passRange.type,
        accurate: false,
        finalPosition,
        // scatterPath omitted to enforce direct flight visual per user request
      });
    } else {
      // Accurate
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
      scatterPath,
    };
  }

  public checkInterceptions(
    from: { x: number; y: number },
    to: { x: number; y: number },
    opponents: Player[],
    isAccurate: boolean
  ): InterceptionAttempt[] {
    const interceptors: InterceptionAttempt[] = [];
    const distance = this.calculateDistance(from, to);

    for (const opponent of opponents) {
      if (!opponent.gridPosition || opponent.status !== PlayerStatus.ACTIVE)
        continue;

      const distFromStart = this.calculateDistance(from, opponent.gridPosition);
      const distToEnd = this.calculateDistance(opponent.gridPosition, to);

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

  public attemptInterception(
    player: Player,
    modifier: number,
    markingOpponents: number
  ): boolean {
    const target = player.stats.AG;
    const totalModifier = modifier - markingOpponents;
    const roll = Math.floor(Math.random() * 6) + 1;

    if (roll === 6) {
      this.eventBus.emit(GameEventNames.DiceRoll, {
        rollType: "Interception",
        diceType: "d6",
        value: roll,
        total: roll,
        description: `Interception (Target ${target}+): SUCCESS (Natural 6)`,
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
      description: `Interception (Target ${target}+, Mod ${totalModifier}): ${success ? "SUCCESS" : "Failed"}`,
      passed: success,
    });

    return success;
  }

  public getSquaresInRange(
    from: { x: number; y: number },
    passType: PassType
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    const range = PassController.PASS_RANGES.find((r) => r.type === passType);

    if (!range) return squares;

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

  public getAllRanges(from: {
    x: number;
    y: number;
  }): Map<PassType, { x: number; y: number }[]> {
    const ranges = new Map<PassType, { x: number; y: number }[]>();
    for (const passRange of PassController.PASS_RANGES) {
      ranges.set(passRange.type, this.getSquaresInRange(from, passRange.type));
    }
    return ranges;
  }
}
