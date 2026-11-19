import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

const isAdjacent = (
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number }
): boolean =>
  !!a &&
  Math.abs(a.x - b.x) <= 1 &&
  Math.abs(a.y - b.y) <= 1 &&
  !(a.x === b.x && a.y === b.y);

export const ArmBarRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (ctx.cause !== "dodge" || !ctx.vacatedSquare) return;
    if (!isAdjacent(self.gridPosition, ctx.vacatedSquare)) return;

    const av = ctx.player.stats.AV;
    const breaksAlready =
      ctx.forcedBreak || ctx.roll + ctx.armourModifier >= av;
    if (!breaksAlready && ctx.roll + ctx.armourModifier + 1 >= av) {
      ctx.armourModifier += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.ARM_BAR,
        effect: "Arm Bar: +1 to the armour roll",
      });
    } else {
      ctx.injuryModifier += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.ARM_BAR,
        effect: "Arm Bar: +1 saved for the injury roll",
      });
    }
  },
};
