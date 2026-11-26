import { type Player } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type BlockAnalysis } from "../../types/Actions";
import { type BlockRollData } from "../../services/BlockResolutionService";
import { blockDiceForStrength } from "../validators/BlockValidator";
import { GameOperation } from "../core/GameOperation";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { InjuryOperation } from "../operations/InjuryOperation";
import { type BlockDeclaredContext, type BlockResultContext } from "../skills";

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
  for (const p of [defender, attacker]) {
    if (hasSkill(p.skills, SkillType.BALL_AND_CHAIN)) {
      rolls.push(new InjuryOperation(p.id, { stunnedIsKnockedOut: true }));
    }
  }
  return rolls;
}
