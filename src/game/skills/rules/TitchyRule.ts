import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { type SkillRule } from "../SkillRule";

export const TitchyRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id === ctx.player.id) {
      ctx.modifiers += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.TITCHY,
        effect: "Titchy: +1 to the dodge",
      });
      return;
    }

    if (self.teamId === ctx.player.teamId) return;
    if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return;
    if (ctx.markingPenalty >= 0) return;
    const dx = Math.abs(self.gridPosition.x - ctx.to.x);
    const dy = Math.abs(self.gridPosition.y - ctx.to.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) return;

    ctx.modifiers += 1;
    ctx.markingPenalty += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TITCHY,
      effect: "Titchy: does not count as Marking the dodge",
    });
  },
};
