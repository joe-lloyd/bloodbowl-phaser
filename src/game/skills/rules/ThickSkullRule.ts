/**
 * Thick Skull (2025 p.137) — "When an Injury Roll is made for this player,
 * they will only be Knocked-out on the roll of a 9; a roll of an 8 will be
 * treated as a Stunned result." (The Stunty interplay — KO only on 8,
 * 7 becomes Stunned — lands with the Stunty trait.)
 */

import { SkillType } from "../../../types/Skills";
import { InjuryResult } from "../../controllers/InjuryController";
import { SkillRule } from "../SkillRule";

export const ThickSkullRule: SkillRule = {
  onInjuryRoll(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (ctx.result !== InjuryResult.KO) return;
    if (ctx.roll + ctx.modifier !== 8) return;

    ctx.result = InjuryResult.STUNNED;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.THICK_SKULL,
      effect: "Thick Skull: the 8 is only a Stunned result",
    });
  },
};
