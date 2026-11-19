import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const PrehensileTailRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.teamId === ctx.player.teamId) return;

    if (!self.gridPosition) return;
    const dx = Math.abs(self.gridPosition.x - ctx.from.x);
    const dy = Math.abs(self.gridPosition.y - ctx.from.y);
    if (dx > 1 || dy > 1) return;

    if (ctx.triggers.some((t) => t.skill === SkillType.PREHENSILE_TAIL)) return;

    ctx.modifiers -= 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.PREHENSILE_TAIL,
      effect: "Prehensile Tail: -1 to the dodge",
    });
  },
  onJumpDeclared(ctx, self) {
    if (self.teamId === ctx.player.teamId) return;
    if (ctx.triggers.some((t) => t.skill === SkillType.PREHENSILE_TAIL)) return;

    ctx.negativeModifier -= 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.PREHENSILE_TAIL,
      effect: "Prehensile Tail: -1 to the Jump",
    });
  },
};
