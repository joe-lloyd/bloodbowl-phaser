import { IEventBus } from "../../services/EventBus";
import { Player, hasTackleZone } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { BallMovementController } from "./BallMovementController";
import { DiceController } from "./DiceController";
import { withRerollOffer } from "../skills";

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

/** Out-of-range marker in PASSING_ARRAY (mirrors the rulebook range ruler). */
const X = null;
/** Range-ruler reach in squares: the array spans [-13, +13] on each axis. */
const RULER_RADIUS = 13;
/**
 * The Blood Bowl range ruler, as the negative-modifier magnitude applied to
 * the Passing Ability test for a throw of a given offset. Indexed
 * `[dy + RULER_RADIUS][dx + RULER_RADIUS]`; the centre (the passer's own
 * square) and every `X` are out of range. 0 = Quick, 1 = Short (-1),
 * 2 = Long (-2), 3 = Long Bomb (-3). The ruler is radial (roughly circular),
 * NOT square Chebyshev bands, so diagonal throws reach further than they did.
 */
// prettier-ignore
const PASSING_ARRAY: (number | null)[][] = [
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

  /**
   * The negative-modifier magnitude (0–3) for a throw of this offset per the
   * range ruler, or null if the target is out of range. PASS_RANGES is
   * indexed by this value, so 0→Quick … 3→Long Bomb.
   */
  public static rangeValue(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): number | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > RULER_RADIUS || Math.abs(dy) > RULER_RADIUS) return null;
    return PASSING_ARRAY[dy + RULER_RADIUS][dx + RULER_RADIUS];
  }

  public measureRange(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): PassRange {
    const value = PassController.rangeValue(from, to);
    // Out of range → treat as the hardest throw for the PA test.
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
    player: Player,
    passRange: PassRange,
    markingOpponents: number,
    extraModifier: number = 0
  ): { success: boolean; accurate: boolean; fumbled: boolean; roll: number } {
    const target = player.stats.PA;
    const modifiers =
      this.calculatePassModifiers(passRange, markingOpponents) + extraModifier;

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

  public async attemptPass(
    player: Player,
    from: { x: number; y: number },
    to: { x: number; y: number },
    markingOpponents: number,
    rerollDeps?: import("../skills").RerollDeps,
    /** Skill-trigger modifier (Accurate, Nerves of Steel, …) */
    extraModifier: number = 0,
    /** Hail Mary Pass: an Accurate result is treated as Inaccurate. */
    forceInaccurate: boolean = false
  ): Promise<PassResult> {
    const passRange = this.measureRange(from, to);
    // An inaccurate or fumbled pass is a failed PA test: offer the reroll
    // BEFORE the scatter/fumble resolution so a rerolled pass flies fresh
    const rollAccuracy = () => {
      const test = this.testAccuracy(
        player,
        passRange,
        markingOpponents,
        extraModifier
      );
      return { ...test, success: test.accurate };
    };
    const accuracyTest = rerollDeps
      ? await withRerollOffer(rerollDeps, player, "pass", rollAccuracy)
      : rollAccuracy();
    // Hail Mary Pass: an Accurate result becomes Inaccurate (it still flies,
    // but scatters from the target square).
    const effectiveAccurate = accuracyTest.accurate && !forceInaccurate;
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
    } else if (!effectiveAccurate) {
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
      accurate: effectiveAccurate,
      fumbled: accuracyTest.fumbled,
      roll: accuracyTest.roll,
      target,
      modifiers,
      passType: passRange.type,
      finalPosition,
      scatterPath,
    };
  }

  /**
   * Half-width of the interception corridor, in squares. The range ruler is
   * ~1.75 squares wide, so a player can intercept from up to 0.875 squares
   * either side of the pass line.
   */
  public static readonly INTERCEPT_HALF_WIDTH = 0.875;

  /**
   * Minimum overlap (in squares) the ruler must have with a cell before it
   * counts. On an exact diagonal the ruler's end-corner clips the cells
   * diagonally behind/beyond the line with only a shallow sliver (~0.12 sq)
   * and wrongly flags them; genuine flanking cells overlap far more (~0.375
   * for a straight pass, ~0.875 on a diagonal), so this margin sits in the
   * gap — it drops the corner grazes without losing real interception squares.
   */
  public static readonly INTERCEPT_TOUCH_MARGIN = 0.01;

  /**
   * Range Ruler overlap test. The ruler is a RECTANGLE running from the centre
   * of the passer's square (`from`) to the centre of the ball's landing square
   * (`landing`), INTERCEPT_HALF_WIDTH squares to each side of the pass line. A
   * candidate square is overlapped if the ruler touches ANY part of that
   * square's 1×1 cell — not just its centre. Implemented as an oriented-box vs
   * axis-aligned-cell overlap (Separating Axis Theorem), so it matches exactly
   * the band drawn in the pass-setup preview. Both the preview and the pass
   * resolution call this on integer square centres, so they always agree.
   */
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

    // Ruler rectangle: centred on the segment midpoint, half-length len/2 along
    // the pass line, half-width INTERCEPT_HALF_WIDTH across it.
    const dirX = ux / len;
    const dirY = uy / len;
    const perpX = -dirY;
    const perpY = dirX;
    const midX = (from.x + landing.x) / 2;
    const midY = (from.y + landing.y) / 2;
    const halfLen = len / 2;
    const halfWid = PassController.INTERCEPT_HALF_WIDTH;

    const cdx = square.x - midX;
    const cdy = square.y - midY;

    // Separating Axis Theorem over the ruler's 2 axes and the cell's 2 axes.
    // Touching (equality) counts as an overlap.
    const axes: [number, number][] = [
      [dirX, dirY],
      [perpX, perpY],
      [1, 0],
      [0, 1],
    ];
    const margin = PassController.INTERCEPT_TOUCH_MARGIN;
    for (const [ax, ay] of axes) {
      const centreDist = Math.abs(cdx * ax + cdy * ay);
      const rulerReach =
        halfLen * Math.abs(dirX * ax + dirY * ay) +
        halfWid * Math.abs(perpX * ax + perpY * ay);
      const cellReach = 0.5 * Math.abs(ax) + 0.5 * Math.abs(ay);
      // Require more than a pixel-thin overlap: subtract the touch margin so a
      // grazing corner/edge contact is treated as separated.
      if (centreDist > rulerReach + cellReach - margin) return false;
    }
    return true;
  }

  /**
   * Every board square the passer→target Range Ruler corridor passes over —
   * i.e. the squares a player could intercept from — excluding the passer's
   * own square and the target square. Used to preview the interception zone
   * during pass setup; shares its geometry with checkInterceptions.
   */
  public getInterceptionSquares(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    for (let x = 0; x < 26; x++) {
      for (let y = 0; y < 15; y++) {
        if (x === from.x && y === from.y) continue;
        if (x === to.x && y === to.y) continue;
        if (PassController.rulerOverlaps(from, to, { x, y })) {
          squares.push({ x, y });
        }
      }
    }
    return squares;
  }

  /**
   * Standing opposition players (with their Tackle Zone) whose square the
   * passer→landing Range Ruler overlaps. `landing` is the ball's ACTUAL
   * landing square, which may differ from the declared target after scatter.
   */
  public checkInterceptions(
    from: { x: number; y: number },
    landing: { x: number; y: number },
    opponents: Player[],
    isAccurate: boolean
  ): InterceptionAttempt[] {
    const interceptors: InterceptionAttempt[] = [];
    const modifier = isAccurate ? -3 : -2;

    for (const opponent of opponents) {
      const pos = opponent.gridPosition;
      // A player that has lost its Tackle Zone (Prone/Stunned/Distracted)
      // may not intercept.
      if (!pos || !hasTackleZone(opponent)) continue;
      // The passer's own square and the landing square never intercept.
      if (pos.x === from.x && pos.y === from.y) continue;
      if (pos.x === landing.x && pos.y === landing.y) continue;

      if (PassController.rulerOverlaps(from, landing, pos)) {
        interceptors.push({
          playerId: opponent.id,
          position: pos,
          modifier,
        });
      }
    }
    return interceptors;
  }

  /**
   * Resolve an interception Agility Test. `baseModifier` is -3 (accurate) or
   * -2 (inaccurate); `markingOpponents` adds -1 each. A natural 6 always
   * intercepts and a natural 1 always fails (handled by rollSkillCheck).
   */
  public attemptInterception(
    player: Player,
    baseModifier: number,
    markingOpponents: number
  ): { success: boolean; roll: number } {
    const target = player.stats.AG;
    const totalModifier = baseModifier - markingOpponents;
    const check = this.diceController.rollSkillCheck(
      "Interception",
      target,
      totalModifier,
      player.playerName
    );

    return { success: check.success, roll: check.roll };
  }

  public getSquaresInRange(
    from: { x: number; y: number },
    passType: PassType
  ): { x: number; y: number }[] {
    const squares: { x: number; y: number }[] = [];
    // PASS_RANGES is ordered by range-ruler value (0=Quick … 3=Long Bomb).
    const value = PassController.PASS_RANGES.findIndex(
      (r) => r.type === passType
    );
    if (value < 0) return squares;

    for (let x = 0; x < 26; x++) {
      for (let y = 0; y < 15; y++) {
        if (PassController.rangeValue(from, { x, y }) === value) {
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
