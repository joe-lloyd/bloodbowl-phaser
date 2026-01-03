import { Player } from "../../types/Player";

export class ArmourController {
  /**
   * Check if armour is broken
   * @param player The player being hit
   * @param roll Total of 2D6 roll
   * @returns true if armour is broken
   */
  public isArmourBroken(player: Player, roll: number): boolean {
    const target = player.stats.AV;
    // Blood Bowl 2020/2025: Achievement of target breaks armour
    // e.g. AV 9+ means 9 or more breaks it.
    return roll >= target;
  }
}
