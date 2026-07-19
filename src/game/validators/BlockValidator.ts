import { Player } from "../../types/Player";
import { BlockAnalysis } from "../../types/Actions";
import { AssistValidator } from "./AssistValidator";

/**
 * Block dice from two effective strengths (assists already folded in). More
 * than double is 3 dice, any other advantage is 2; the stronger side chooses
 * (isUphill = the attacker is the weaker side, so the defender chooses).
 */
export function blockDiceForStrength(
  attackerST: number,
  defenderST: number
): { diceCount: number; isUphill: boolean } {
  if (attackerST === defenderST) return { diceCount: 1, isUphill: false };
  if (attackerST > defenderST) {
    return { diceCount: attackerST > defenderST * 2 ? 3 : 2, isUphill: false };
  }
  return { diceCount: defenderST > attackerST * 2 ? 3 : 2, isUphill: true };
}

export class BlockValidator extends AssistValidator {
  /**
   * Analyze a block to determine dice and assists
   */
  public analyzeBlock(
    attacker: Player,
    defender: Player,
    allPlayers: Player[],
    activeTeamId: string | null = null
  ): BlockAnalysis {
    // 1. Calculate Assists (Guard/Defensive resolved via the assist seam)
    const attackerAssists = this.getValidAssists(
      attacker,
      defender,
      allPlayers,
      "block",
      activeTeamId
    );
    const defenderAssists = this.getValidAssists(
      defender,
      attacker,
      allPlayers,
      "block",
      activeTeamId
    );

    // 2. Calculate Final Strength
    const finalAttackerST = attacker.stats.ST + attackerAssists.length;
    const finalDefenderST = defender.stats.ST + defenderAssists.length;

    // 3. Determine Dice
    const { diceCount, isUphill } = blockDiceForStrength(
      finalAttackerST,
      finalDefenderST
    );

    return {
      diceCount,
      isUphill,
      attackerST: finalAttackerST,
      defenderST: finalDefenderST,
      attackerAssists,
      defenderAssists,
    };
  }
}
