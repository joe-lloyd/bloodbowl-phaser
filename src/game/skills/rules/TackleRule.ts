import { SkillType, hasSkill } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { opponentWithinReach } from "./dodgeReach";

export const TackleRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (!opponentWithinReach(ctx, self)) return;
    if (!ctx.skillRerollAllowed) return;

    ctx.skillRerollAllowed = false;
    if (hasSkill(ctx.player.skills, SkillType.DODGE)) {
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.TACKLE,
        effect: "Tackle: denies the Dodge skill re-roll",
      });
    }
  },
};
