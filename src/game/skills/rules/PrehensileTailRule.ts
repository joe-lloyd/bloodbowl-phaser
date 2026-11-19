import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";
import { opponentWithinReach } from "./dodgeReach";

export const PrehensileTailRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (!opponentWithinReach(ctx, self)) return;

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
