import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const FoulAppearanceRule: SkillRule = {
  onBlockDeclared(ctx, self) {
    if (self.id !== ctx.defender.id || !ctx.dice) return;
    if (ctx.isBallAndChain) return;
    const roll = ctx.dice.rollD6(
      `Foul Appearance (${ctx.attacker.playerName})`,
      ctx.attacker.teamId
    );
    if (roll !== 1) {
      return;
    }

    ctx.cancelled = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.FOUL_APPEARANCE,
      effect: "Foul Appearance: the block is cancelled",
    });
  },
};
