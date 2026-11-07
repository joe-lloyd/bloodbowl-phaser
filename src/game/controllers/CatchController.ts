import { Player, hasTackleZone } from "@/types/Player";

/**
 * CatchController - the modifiers to a Catch: -1 for a ball that Bounced or
 * was Thrown-in, and -1 for each opposition player Marking the catcher.
 * catchRoll in CatchOperation makes the roll.
 */
export class CatchController {
  /**
   * Calculate catch modifiers based on circumstances
   */
  public calculateModifiers(
    position: { x: number; y: number },
    opponents: Player[],
    isBounce: boolean = false,
    isThrowIn: boolean = false
  ): number {
    let modifier = 0;

    if (isBounce || isThrowIn) {
      modifier -= 1;
    }

    // -1 per opponent marking the catcher
    modifier -= this.countMarkingOpponents(position, opponents);

    return modifier;
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
      if (!opponent.gridPosition || !hasTackleZone(opponent)) {
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
