import { Player } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { BlockAnalysis } from "../../types/Actions";
import { BlockRollData } from "../../services/BlockResolutionService";
import { blockDiceForStrength } from "../validators/BlockValidator";
import { GameOperation } from "../core/GameOperation";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { InjuryOperation } from "../operations/InjuryOperation";
import { BlockDeclaredContext, BlockResultContext } from "../skills";

/** Recompute the dice if a rule changed the effective strengths. */
export function recomputeBlockDice(
  ctx: BlockDeclaredContext,
  analysis: BlockAnalysis
): void {
  if (
    ctx.attackerStrength === analysis.attackerST &&
    ctx.defenderStrength === analysis.defenderST
  ) {
    return;
  }
  const recomputed = blockDiceForStrength(
    ctx.attackerStrength,
    ctx.defenderStrength
  );
  ctx.diceCount = recomputed.diceCount;
  ctx.isAttackerChoice = !recomputed.isUphill;
}

/**
 * An uphill Block with a re-roll to offer asks the attacker first;
 * otherwise the chooser picks a result.
 */
export function blockChoiceStage(
  rollData: BlockRollData
): "attacker-reroll" | "pick" {
  const canReroll =
    rollData.teamRerollAvailable ||
    rollData.proAvailable ||
    rollData.brawlerAvailable ||
    rollData.veteranRerollAvailable;
  return !rollData.isAttackerChoice && canReroll ? "attacker-reroll" : "pick";
}

/**
 * Only the players actually knocked down roll armour — none at all when a
 * rule placed them prone (Wrestle), though a Ball & Chain player Placed
 * Prone still rolls Injury. Defender first. On Both Down each player
 * knocked the other down as part of the Block Action, so either can earn
 * casualty SPP even though only the attacker declared the Block.
 */
export function bothDownRolls(
  ctx: BlockResultContext,
  attacker: Player,
  defender: Player
): GameOperation[] {
  const rolls: GameOperation[] = [];
  if (!ctx.placedProne) {
    if (ctx.defenderKnockedDown) {
      rolls.push(new ArmourOperation(defender.id, attacker.id));
    }
    if (ctx.attackerKnockedDown) {
      rolls.push(new ArmourOperation(attacker.id, defender.id));
    }
    return rolls;
  }
  [defender, attacker].forEach((p) => {
    if (hasSkill(p.skills, SkillType.BALL_AND_CHAIN)) {
      rolls.push(new InjuryOperation(p.id, { stunnedIsKnockedOut: true }));
    }
  });
  return rolls;
}
