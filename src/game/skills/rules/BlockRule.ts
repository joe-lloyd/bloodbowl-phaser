/**
 * Block — a player with Block is not Knocked Down as a result of a Both Down
 * (Blood Bowl 2025). If both players have Block, neither is knocked down.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const BlockRule: SkillRule = {
  onBlockResult(ctx, self) {
    if (ctx.resultType !== "both-down") return;

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
