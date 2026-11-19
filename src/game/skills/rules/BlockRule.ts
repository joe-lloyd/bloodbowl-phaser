import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const BlockRule: SkillRule = {
  onBlockResult(ctx, self) {
    if (ctx.resultType !== "both-down") return;

    if (ctx.placedProne) return;

    if (self.id === ctx.attacker.id && ctx.attackerKnockedDown) {
      ctx.attackerKnockedDown = false;
    } else if (self.id === ctx.defender.id && ctx.defenderKnockedDown) {
      ctx.defenderKnockedDown = false;
    } else {
      return;
    }

    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BLOCK,
      effect: "Block: stays up on Both Down",
    });
  },
};
