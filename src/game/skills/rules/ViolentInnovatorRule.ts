import { SkillType } from "../../../types/Skills";
import { type CasualtyContext, type SkillRule } from "../SkillRule";

export const ViolentInnovatorRule: SkillRule = {
  onCasualty(ctx: CasualtyContext, self) {
    if (
      ctx.cause !== "special" ||
      self.id !== ctx.causedBy?.id ||
      self.teamId === ctx.player.teamId
    )
      return;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.VIOLENT_INNOVATOR,
      effect:
        "Violent Innovator: credited with the Casualty caused by the Special Action",
    });
  },
};
