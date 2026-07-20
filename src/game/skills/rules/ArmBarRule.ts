/**
 * Arm Bar (2025 rulebook p.126) — "If an opposing player Falls Over as a
 * result of attempting to Dodge, Leap or Jump away from a square in this
 * player's Tackle Zone, this player may use this Skill. If they do, they may
 * apply a +1 modifier to either the Armour Roll or Injury Roll. This modifier
 * may be applied after the roll has been made."
 *
 * `self` is a standing opponent marking the vacated square. Auto-optimized
 * exactly like Mighty Blow: the +1 goes to the armour roll when it flips the
 * break, otherwise it is saved for the injury roll.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

const isAdjacent = (
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number }
): boolean =>
  !!a && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 &&
  !(a.x === b.x && a.y === b.y);

export const ArmBarRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (ctx.cause !== "dodge" || !ctx.vacatedSquare) return;
    if (!isAdjacent(self.gridPosition, ctx.vacatedSquare)) return;

    const av = ctx.player.stats.AV;
    const breaksAlready = ctx.forcedBreak || ctx.roll + ctx.armourModifier >= av;
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
