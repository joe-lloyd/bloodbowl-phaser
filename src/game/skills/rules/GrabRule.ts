import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const GrabRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.attacker.id || ctx.isBlitz) return;
    ctx.grabPush = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.GRAB,
      effect: "Grab: pushes into any adjacent square",
    });
  },
};
