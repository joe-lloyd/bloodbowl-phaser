/**
 * Regeneration (2025 p.135) — "Whenever this player suffers a Casualty,
 * before making the Casualty Roll for them, roll a D6. On a 1-3, this
 * player suffers the Casualty; make the Casualty Roll as normal. On a 4+,
 * this player regenerates and ignores the Casualty ... and is instead
 * placed in their team's Reserves Box."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const RegenerationRule: SkillRule = {
  onCasualty(ctx, self) {
    if (self.id !== ctx.player.id || !ctx.dice) return;
    const roll = ctx.dice.rollD6(
      `Regeneration (${self.playerName})`,
      self.teamId
    );
    if (roll >= 4) {
      ctx.regenerated = true;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.REGENERATION,
        effect: `Regeneration: ${roll} — the casualty is ignored`,
      });
    }
  },
};
