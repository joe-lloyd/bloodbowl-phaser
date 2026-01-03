import { Player } from "../../types/Player";
import { hasSkill, SkillType } from "../../types/Skills";
import { BlockAnalysis } from "../../types/Actions";
import { AssistValidator } from "./AssistValidator";

export class BlockValidator extends AssistValidator {
  /**
   * Analyze a block to determine dice and assists
   */
  public analyzeBlock(
    attacker: Player,
    defender: Player,
    allPlayers: Player[]
  ): BlockAnalysis {
    // 1. Calculate Assists
    const attackerAssists = this.getValidAssists(
      attacker,
      defender,
      allPlayers
    );
    const defenderAssists = this.getValidAssists(
      defender,
      attacker,
      allPlayers
    );

    // 2. Calculate Final Strength
    const finalAttackerST = attacker.stats.ST + attackerAssists.length;
    const finalDefenderST = defender.stats.ST + defenderAssists.length;

    // 3. Determine Dice
    let diceCount = 1;
    let isUphill = false;

    if (finalAttackerST === finalDefenderST) {
      diceCount = 1;
      isUphill = false;
    } else if (finalAttackerST > finalDefenderST) {
      if (finalAttackerST > finalDefenderST * 2) {
        diceCount = 3;
      } else {
        diceCount = 2;
      }
      isUphill = false;
    } else {
      isUphill = true;
      if (finalDefenderST > finalAttackerST * 2) {
        diceCount = 3;
      } else {
        diceCount = 2;
      }
    }

    return {
      diceCount,
      isUphill,
      attackerST: finalAttackerST,
      defenderST: finalDefenderST,
      attackerAssists,
      defenderAssists,
    };
  }

  protected canProvideAssist(player: Player, isMarked: boolean): boolean {
    if (!isMarked) return true;

    // Exception: GUARD skill ignores marking for block assists
    return hasSkill(player.skills, SkillType.GUARD);
  }
}
