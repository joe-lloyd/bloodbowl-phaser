import type { RerollDeps } from "../skills";
import { type IEventBus } from "../../services/EventBus";
import { type Player, hasTackleZone } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import type { BallMovementController } from "./BallMovementController";
import type { DiceController } from "./DiceController";
import { isOnPitch } from "../rules/pitchSquares";
import { settleOffObstacle } from "../rules/ballFlight";
import { withRerollOffer } from "../skills";
import { GameConfig } from "../../config/GameConfig";

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
}

export interface InterceptionAttempt {
  playerId: string;
  position: { x: number; y: number };
  modifier: number;
}

type PassBand = 0 | 1 | 2 | 3;

const X = null;

const RULER_RADIUS = 13;

// prettier-ignore
const PASSING_ARRAY: readonly (readonly (PassBand | null)[])[] = [
  [X, X, X, X, X, X, X, X, X, X, X, 3, 3, 3, 3, 3, X, X, X, X, X, X, X, X, X, X, X],
  [X, X, X, X, X, X, X, X, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, X, X, X, X, X, X, X, X],
  [X, X, X, X, X, X, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, X, X, X, X, X, X],
  [X, X, X, X, X, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, X, X, X, X, X],
  [X, X, X, X, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, X, X, X, X],
  [X, X, X, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, X, X, X],
  [X, X, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, X, X],
  [X, X, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, X, X],
  [X, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, X],
  [X, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, X],
  [X, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, X],
  [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
  [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
  [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0, X, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
  [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
  [3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
  [X, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, X],
  [X, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, X],
  [X, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, X],
  [X, X, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, X, X],
  [X, X, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, X, X],
  [X, X, X, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, X, X, X],
  [X, X, X, X, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, X, X, X, X],
  [X, X, X, X, X, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, X, X, X, X, X],
  [X, X, X, X, X, X, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, X, X, X, X, X, X],
  [X, X, X, X, X, X, X, X, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, X, X, X, X, X, X, X, X],
  [X, X, X, X, X, X, X, X, X, X, X, 3, 3, 3, 3, 3, X, X, X, X, X, X, X, X, X, X, X],
];

export class PassController {
  private static readonly PASS_RANGES: [PassRange, PassRange, PassRange, PassRange] = [
    { type: "Quick Pass", modifier: 0, minDistance: 0, maxDistance: 3 },
    { type: "Short Pass", modifier: -1, minDistance: 4, maxDistance: 6 },
    { type: "Long Pass", modifier: -2, minDistance: 7, maxDistance: 10 },
    { type: "Long Bomb", modifier: -3, minDistance: 11, maxDistance: 999 },
  ];

  private eventBus: IEventBus;
  private movementController: BallMovementController;
  private diceController: DiceController;
  constructor(
    eventBus: IEventBus,
    movementController: BallMovementController,
    diceController: DiceController
  ) {
    this.eventBus = eventBus;
    this.movementController = movementController;
    this.diceController = diceController;
  }

  public settleLanding(square: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return isOnPitch(square)
      ? settleOffObstacle(this.diceController, square)
      : square;
  }

  public static rangeValue(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): PassBand | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > RULER_RADIUS || Math.abs(dy) > RULER_RADIUS) return null;
    return PASSING_ARRAY[dy + RULER_RADIUS]?.[dx + RULER_RADIUS] ?? null;
  }

  public measureRange(
    from: { x: number; y: number },
    to: { x: number; y: number },

    hailMary = false
  ): PassRange {
    if (hailMary) return PassController.PASS_RANGES[3];
    const value = PassController.rangeValue(from, to);

    return PassController.PASS_RANGES[value ?? 3];
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
{ player,passRange,markingOpponents,extraModifier=0,rollName="Pass" }: { player: Player; passRange: PassRange; markingOpponents: number; extraModifier?: number; rollName?: "Pass"|"Throw Team-mate"|"Kick Team-mate"; }  ): {
    success: boolean;
    accurate: boolean;
    fumbled: boolean;
    roll: number;
    needed: number;
  } {
    const target = player.stats.PA;
    const modifiers =
      this.calculatePassModifiers(passRange, markingOpponents) + extraModifier;

    const check = this.diceController.rollSkillCheck(
      { reason: rollName,target,modifier: modifiers,playerName: player.playerName }    );
    const roll = check.roll;

    const fumbled = roll === 1 || (roll !== 6 && roll + modifiers <= 1);

    return {
      success: check.success || !fumbled,
      accurate: check.success,
      needed: check.needed,
      fumbled,
      roll,
    };
  }

  public scatterBall(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return this.movementController.bounce(position);
  }

  public bounceBall(position: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    return this.movementController.bounce(position);
  }

  public attemptCatch(
    player: Player,
    isAccuratePass: boolean,
    markingOpponents: number
  ): { success: boolean; roll: number } {
    const target = player.stats.AG;
    const modifier = (isAccuratePass ? 1 : 0) - markingOpponents;
    const check = this.diceController.rollSkillCheck(
      { reason: "Catch",target,modifier,playerName: player.playerName }    );

    return { success: check.success, roll: check.roll };
  }

  public async attemptPass(
{ player,from,to,markingOpponents,rerollDeps,extraModifier=0,hailMary=false,setPiece=false }: { player: Player; from: { x: number; y: number; }; to: { x: number; y: number; }; markingOpponents: number; rerollDeps?: RerollDeps; extraModifier?: number; hailMary?: boolean; setPiece?: boolean; }  ): Promise<PassResult> {
    const passRange = this.measureRange(from, to, hailMary);

    const rollAccuracy = () => {
      if (setPiece) {
        const check = this.diceController.rollSkillCheck(
          { reason: "Pass (Set Piece)",target: 2,modifier: 0,playerName: player.playerName }        );
        return {
          success: check.success,
          accurate: check.success,
          fumbled: check.roll === 1,
          roll: check.roll,
          needed: check.needed,
        };
      }
      const test = this.testAccuracy(
        { player,passRange,markingOpponents,extraModifier }      );
      return { ...test, success: test.accurate };
    };
    const accuracyTest = rerollDeps
      ? await withRerollOffer(rerollDeps, player, "pass", rollAccuracy)
      : rollAccuracy();

    const effectiveAccurate = accuracyTest.accurate && !hailMary;
    const target = player.stats.PA;
    const modifiers = this.calculatePassModifiers(passRange, markingOpponents);

    if (accuracyTest.fumbled) {
      this.eventBus.emit(GameEventNames.PassFumbled, {
        playerId: player.id,
        position: from,
        bouncePosition: { ...from },
      });
    }

    return {
      success: !accuracyTest.fumbled,
      accurate: effectiveAccurate,
      fumbled: accuracyTest.fumbled,
      roll: accuracyTest.roll,
      target,
      modifiers,
      passType: passRange.type,
    };
  }

  public scatterPass(target: { x: number; y: number }): {
    x: number;
    y: number;
  }[] {
    return [{ ...target }, ...this.movementController.scatter(target)];
  }

  public static readonly INTERCEPT_HALF_WIDTH = 0.875;

  public static readonly INTERCEPT_TOUCH_MARGIN = 0.01;

  public static rulerOverlaps(
    from: { x: number; y: number },
    landing: { x: number; y: number },
    square: { x: number; y: number }
  ): boolean {
    const ux = landing.x - from.x;
    const uy = landing.y - from.y;
    const lenSq = ux * ux + uy * uy;
    if (lenSq === 0) return square.x === from.x && square.y === from.y;
    const len = Math.sqrt(lenSq);

    const direction = { x: ux / len, y: uy / len };
    const perpendicular = { x: -direction.y, y: direction.x };
    const midpoint = { x: (from.x + landing.x) / 2, y: (from.y + landing.y) / 2 };
    const halfLen = len / 2;
    const halfWid = PassController.INTERCEPT_HALF_WIDTH;

    const offset = { x: square.x - midpoint.x, y: square.y - midpoint.y };

    const axes: [number, number][] = [
      [direction.x, direction.y],
      [perpendicular.x, perpendicular.y],
      [1, 0],
      [0, 1],
    ];
    const margin = PassController.INTERCEPT_TOUCH_MARGIN;
    for (const [ax, ay] of axes) {
      const centreDist = Math.abs(offset.x * ax + offset.y * ay);
      const rulerReach =
        halfLen * Math.abs(direction.x * ax + direction.y * ay) +
        halfWid * Math.abs(perpendicular.x * ax + perpendicular.y * ay);
      const cellReach = 0.5 * Math.abs(ax) + 0.5 * Math.abs(ay);

      if (centreDist > rulerReach + cellReach - margin) return false;
    }
    return true;
  }

  public getInterceptionSquares(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    for (let x = 0; x < GameConfig.PITCH_WIDTH; x++) {
      for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
        if (PassController.isEndpoint({ x, y }, from, to)) continue;
        if (PassController.rulerOverlaps(from, to, { x, y })) {
          squares.push({ x, y });
        }
      }
    }
    return squares;
  }

  private static isEndpoint(position: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    return (position.x === from.x && position.y === from.y) || (position.x === to.x && position.y === to.y);
  }

  private isEligibleInterceptor(opponent: Player, from: { x: number; y: number }, target: { x: number; y: number }): opponent is Player & { gridPosition: { x: number; y: number } } {
    const position = opponent.gridPosition;
    return position !== undefined && hasTackleZone(opponent) && !hasSkill(opponent.skills, SkillType.NO_BALL)
      && !PassController.isEndpoint(position, from, target) && PassController.rulerOverlaps(from, target, position);
  }

  public checkInterceptions({ from, target, opponents, isAccurate }: { from: { x: number; y: number }; target: { x: number; y: number }; opponents: Player[]; isAccurate: boolean }): InterceptionAttempt[] {
    const modifier = isAccurate ? -3 : -2;
    return opponents.flatMap((opponent) => this.isEligibleInterceptor(opponent, from, target)
      ? [{ playerId: opponent.id, position: opponent.gridPosition, modifier }] : []);
  }

  public attemptInterception(
    player: Player,
    baseModifier: number,
    markingOpponents: number
  ): { success: boolean; roll: number } {
    const target = player.stats.AG;
    const totalModifier = baseModifier - markingOpponents;
    const check = this.diceController.rollSkillCheck(
      { reason: "Interception",target,modifier: totalModifier,playerName: player.playerName,teamId: player.teamId }    );

    return { success: check.success, roll: check.roll };
  }

  public getSquaresInRange(
    from: { x: number; y: number },
    passType: PassType
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];

    const value = PassController.PASS_RANGES.findIndex(
      (r) => r.type === passType
    );
    if (value < 0) return squares;

    for (let x = 0; x < GameConfig.PITCH_WIDTH; x++) {
      for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
        if (PassController.rangeValue(from, { x, y }) === value) {
          squares.push({ x, y });
        }
      }
    }
    return squares;
  }

  public getAllRanges(
    from: { x: number; y: number },

    allowed?: readonly PassType[]
  ): Map<PassType, { x: number; y: number }[]> {
    const ranges = new Map<PassType, { x: number; y: number }[]>();
    for (const passRange of PassController.PASS_RANGES) {
      if (allowed && !allowed.includes(passRange.type)) continue;
      ranges.set(passRange.type, this.getSquaresInRange(from, passRange.type));
    }
    return ranges;
  }
}
