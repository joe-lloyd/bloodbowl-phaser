import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const BreakTackleRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const bonus = self.stats.ST >= 5 ? 3 : self.stats.ST === 4 ? 1 : 0;
    if (bonus === 0) return;
    if (!ctx.arbiter?.onceAvailable(self, SkillType.BREAK_TACKLE)) return;

    ctx.arbiter.consumeOnce(self, SkillType.BREAK_TACKLE);
    ctx.modifiers += bonus;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.BREAK_TACKLE,
      effect: `Break Tackle: +${String(bonus)} to the dodge (ST ${String(self.stats.ST)})`,
    });
  },
};
