import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const HornsRule: SkillRule = {
  onBlockDeclared(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.isBlitz) return;
    ctx.attackerStrength += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.HORNS,
      effect: "Horns: +1 Strength on the Blitz block",
    });
  },
};
