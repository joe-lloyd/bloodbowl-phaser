import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { BallMovementController } from "./BallMovementController";
import { DiceController } from "./DiceController";

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

export class PassController {
  private static readonly PASS_RANGES: PassRange[] = [
    { type: "Quick Pass", modifier: 0, minDistance: 0, maxDistance: 3 },
    { type: "Short Pass", modifier: -1, minDistance: 4, maxDistance: 6 },
    { type: "Long Pass", modifier: -2, minDistance: 7, maxDistance: 10 },
    { type: "Long Bomb", modifier: -3, minDistance: 11, maxDistance: 999 },
  ];

  constructor(
    private eventBus: IEventBus,
    private movementController: BallMovementController,
    private diceController: DiceController
  ) {}

  private calculateDistance(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): number {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    return Math.max(dx, dy);
  }

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

    // Use DiceController for the roll
    const check = this.diceController.rollSkillCheck(
      "Pass",
      target,
      modifiers,
      player.playerName
    );
    const roll = check.roll;

    // Fumble on natural 1 or modified <= 1
    const fumbled = roll === 1 || (roll !== 6 && roll + modifiers <= 1);

    return {
      success: check.success || !fumbled,
      accurate: check.success,
      fumbled,
      roll,
    };
  }

  public scatterBall(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return this.movementController!.bounce(position);
  }

  public bounceBall(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return this.movementController!.bounce(position);
  }

  public attemptCatch(
    player: Player,
    isAccuratePass: boolean,
    markingOpponents: number
  ): { success: boolean; roll: number } {
    const target = player.stats.AG;
    const modifier = (isAccuratePass ? 1 : 0) - markingOpponents;
    const check = this.diceController.rollSkillCheck(
      "Catch",
      target,
      modifier,
      player.playerName
    );

    return { success: check.success, roll: check.roll };
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

    let finalPosition = { ...to };
    let scatterPath: { x: number; y: number }[] | undefined;

    if (accuracyTest.fumbled) {
      finalPosition = { ...from };
      this.eventBus.emit(GameEventNames.PassFumbled, {
        playerId: player.id,
        position: from,
        bouncePosition: finalPosition,
      });
    } else if (!accuracyTest.accurate) {
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
      });
    } else {
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
    const check = this.diceController.rollSkillCheck(
      "Interception",
      target,
      totalModifier,
      player.playerName
    );

    return check.success;
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
