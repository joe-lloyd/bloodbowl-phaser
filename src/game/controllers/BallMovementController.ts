import { DiceController } from "./DiceController";

/**
 * BallMovementController
 *
 * Purpose: A stateless physics engine for the ball. Provides pure functions to calculate
 * where the ball goes when it moves unpredictably.
 *
 * IN_SCOPE:
 * - scatter(startPos): 3x d8 logic (Inaccurate Pass). Returns path.
 * - bounce(startPos): 1x d8 logic (Fumble, Failed Catch). Returns new pos.
 * - deviate(startPos): d8 dir + d6 dist (Kickoff). Returns new pos.
 *
 * OUT_OF_SCOPE:
 * - Knowing *why* the ball is moving.
 * - Managing game state.
 * - Triggering turnovers.
 */
export class BallMovementController {
  constructor(private diceController: DiceController) {}

  /**
   * Calculate a scatter (1 square in random direction)
   * used for Bounce.
   * @param position Starting position
   * @returns New position
   */
  public bounce(position: { x: number; y: number }): { x: number; y: number } {
    return this.calculateScatterStep(position, "Bounce");
  }

  /**
   * Calculate a scatter path (3 squares in random directions)
   * used for Inaccurate Pass.
   * @param position Starting position
   * @returns Array of positions (the path)
   */
  public scatter(position: {
    x: number;
    y: number;
  }): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let currentPos = { ...position };

    // Roll 3 d8s at once for a single log entry
    const rolls = this.diceController.rollD8("Scatter", 3);

    for (const direction of rolls) {
      currentPos = this.calculateOffsetPosition(currentPos, direction, 1);
      path.push(currentPos);
    }

    return path;
  }

  /**
   * Calculate deviation (d8 direction + d6 distance)
   * used for Kickoff.
   * @param position Starting position (target square)
   * @returns New position (landing square)
   */
  public deviate(position: { x: number; y: number }): { x: number; y: number } {
    // 1. Roll Direction (d8)
    const direction = this.diceController.rollD8("Kickoff Deviate Direction");

    // 2. Roll Distance (d6)
    const distance = this.diceController.rollD6("Kickoff Deviate Distance");

    return this.calculateOffsetPosition(position, direction, distance);
  }

  /**
   * Helper to calculate a single weighted step (1 sq) based on d8
   */
  private calculateScatterStep(
    position: { x: number; y: number },
    reason: string
  ): { x: number; y: number } {
    const direction = this.diceController.rollD8(reason);
    return this.calculateOffsetPosition(position, direction, 1);
  }

  /**
   * Helper to apply vector math based on direction (1-8)
   */
  private calculateOffsetPosition(
    start: { x: number; y: number },
    direction: number,
    distance: number
  ): { x: number; y: number } {
    let dx = 0;
    let dy = 0;

    // Directions (1: TL, 2: T, 3: TR, 4: L, 5: R, 6: BL, 7: B, 8: BR)
    // Note: This mapping matches standard numpad/Blood Bowl template usually.
    // 1(TL) 2(T) 3(TR)
    // 4(L)       5(R)
    // 6(BL) 7(B) 8(BR)

    switch (direction) {
      case 1: // TL
        dx = -1;
        dy = -1;
        break;
      case 2: // T
        dx = 0;
        dy = -1;
        break;
      case 3: // TR
        dx = 1;
        dy = -1;
        break;
      case 4: // L
        dx = -1;
        dy = 0;
        break;
      case 5: // R
        dx = 1;
        dy = 0;
        break;
      case 6: // BL
        dx = -1;
        dy = 1;
        break;
      case 7: // B
        dx = 0;
        dy = 1;
        break;
      case 8: // BR
        dx = 1;
        dy = 1;
        break;
    }

    return {
      x: start.x + dx * distance,
      y: start.y + dy * distance,
    };
  }
}
