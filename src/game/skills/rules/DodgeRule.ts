import { SkillType, hasSkill } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const DodgeRule: SkillRule = {
  rerollable: ["dodge"],

  onBlockResult(ctx, self) {
    if (ctx.resultType !== "pow-dodge") return;
    if (self.id !== ctx.defender.id || !ctx.defenderKnockedDown) return;
    if (hasSkill(ctx.attacker.skills, SkillType.TACKLE)) return;

    ctx.defenderKnockedDown = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DODGE,
      effect: "Dodge: Defender Stumbles becomes a push",
    });
  },
};
