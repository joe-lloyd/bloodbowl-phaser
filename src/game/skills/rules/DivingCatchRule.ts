import { SkillType } from "../../../types/Skills";
import { Player } from "../../../types/Player";
import { CatchContext, SkillRule } from "../SkillRule";

export const DivingCatchRule: SkillRule = {
  onCatch(ctx: CatchContext, self: Player) {
    if (self.id !== ctx.player.id) return;
    if (ctx.divingCatch) {
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.DIVING_CATCH,
        effect: `Diving Catch: attempts the ${ctx.origin ?? "landing"} ball from an adjacent square`,
      });
    }
    if (ctx.origin === "pass" && ctx.isPassTarget) {
      ctx.modifiers += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.DIVING_CATCH,
        effect: "Diving Catch: +1 to catch the Pass in the target square",
      });
    }
  },
};
