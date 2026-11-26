import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const RegenerationRule: SkillRule = {
  onCasualty(ctx, self) {
    if (self.id !== ctx.player.id || !ctx.dice) return;
    const roll = ctx.dice.rollD6(
      `Regeneration (${self.playerName})`,
      self.teamId
    );
    ctx.regenerationRoll = roll;
    if (!(roll >= 4)) {
      return;
    }

    ctx.regenerated = true;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.REGENERATION,
      effect: `Regeneration: ${String(roll)} — the casualty is ignored`,
    });
  },
};
