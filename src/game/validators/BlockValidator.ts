import { type Player } from "../../types/Player";
import { type BlockAnalysis } from "../../types/Actions";
import { AssistValidator } from "./AssistValidator";

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
  public analyzeBlock({
    attacker,
    defender,
    allPlayers,
    activeTeamId = null,
  }: {
    attacker: Player;
    defender: Player;
    allPlayers: Player[];
    activeTeamId?: string | null | undefined;
  }): BlockAnalysis {
    const attackerAssists = this.getValidAssists({
      subject: attacker,
      opponent: defender,
      allPlayers,
      action: "block",
      activeTeamId,
    });
    const defenderAssists = this.getValidAssists({
      subject: defender,
      opponent: attacker,
      allPlayers,
      action: "block",
      activeTeamId,
    });

    const finalAttackerST = attacker.stats.ST + attackerAssists.length;
    const finalDefenderST = defender.stats.ST + defenderAssists.length;

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
