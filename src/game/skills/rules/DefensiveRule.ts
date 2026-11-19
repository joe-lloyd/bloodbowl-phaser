import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const DefensiveRule: SkillRule = {
  onCountAssists(ctx, self) {
    if (self.id === ctx.assister.id) return;
    if (ctx.negated) return;

    if (ctx.activeTeamId !== ctx.assister.teamId) return;

    ctx.negated = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DEFENSIVE,
      effect: "Defensive: cancels the marked player's Guard",
    });
  },
};
