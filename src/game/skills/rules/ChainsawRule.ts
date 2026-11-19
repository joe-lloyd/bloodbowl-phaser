import { SkillType } from "../../../types/Skills";
import { type SkillRule, type ArmourBreakContext } from "../SkillRule";
import { type Player } from "../../../types/Player";

export const ChainsawRule: SkillRule = {
  onArmourBreak(ctx: ArmourBreakContext, self: Player): void {
    if (self.id !== ctx.player.id || !ctx.knockedDown) return;
    ctx.armourModifier += 3;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CHAINSAW,
      effect: "Chainsaw: +3 to the Armour Roll against the downed wielder",
    });
  },
};
