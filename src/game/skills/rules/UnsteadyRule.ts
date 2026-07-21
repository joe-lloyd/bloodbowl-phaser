/**
 * Unsteady (2025 p.138, trait) - "This player may not declare Secure the
 * Ball Actions."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const UnsteadyRule: SkillRule = {
  onActionDeclared(ctx, self) {
    if (ctx.action !== "secureBall") return;
    ctx.refused = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.UNSTEADY,
      effect: "Unsteady: may not declare Secure the Ball Actions",
    });
  },
};
