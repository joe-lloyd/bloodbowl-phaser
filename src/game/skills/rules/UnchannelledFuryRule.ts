/**
 * Unchannelled Fury (2025 rulebook p.138, trait) — "Whenever this player is
 * activated, after declaring their Action, they must roll a D6. They may
 * apply a +2 modifier to the roll if they have declared a Block Action or a
 * Blitz Action. On a 4+, the player may perform the declared Action as
 * normal. On a 1-3, this player rages incoherently but nothing really
 * happens. Their activation immediately ends."
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const UnchannelledFuryRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const angry = ctx.action === "block" || ctx.action === "blitz";
    ctx.gates.push({
      skill: SkillType.UNCHANNELLED_FURY,
      target: 4,
      modifier: angry ? 2 : 0,
      onFail: { kind: "endActivation" },
    });
  },
};
