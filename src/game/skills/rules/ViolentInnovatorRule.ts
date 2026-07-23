import { SkillType } from "../../../types/Skills";
import { CasualtyContext, SkillRule } from "../SkillRule";

export const ViolentInnovatorRule: SkillRule = {
  onCasualty(ctx: CasualtyContext, self) {
    if (
      ctx.cause !== "special" ||
      !ctx.causedBy ||
      self.id !== ctx.causedBy.id
    ) {
      return;
    }
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.VIOLENT_INNOVATOR,
      effect:
        "Violent Innovator: credited with the Casualty caused by the Special Action",
    });
  },
};
