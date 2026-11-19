import { SkillType, hasSkill } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const TackleRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.teamId === ctx.player.teamId) return;
    if (!self.gridPosition) return;
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1) return;
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
