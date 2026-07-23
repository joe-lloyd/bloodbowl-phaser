/**
 * Chainsaw (2025 rulebook p.122)
 *
 * The Chainsaw Attack Special Action itself lives in ChainsawAttackOperation.
 * This rule implements the always-on clause: "If this player is Knocked Down or
 * Falls Over for any reason, then a +3 modifier is applied when the opposition
 * Coach makes an Armour Roll for this player. This +3 modifier must always be
 * applied." So a downed Chainsaw player is far easier to hurt.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule, ArmourBreakContext } from "../SkillRule";
import { Player } from "../../../types/Player";

export const ChainsawRule: SkillRule = {
  onArmourBreak(ctx: ArmourBreakContext, self: Player): void {
    // Only the downed Chainsaw player's own armour roll is affected.
    if (self.id !== ctx.player.id) return;
    ctx.armourModifier += 3;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.CHAINSAW,
      effect: "Chainsaw: +3 to the Armour Roll against the downed wielder",
    });
  },
};
