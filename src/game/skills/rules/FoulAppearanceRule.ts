/**
 * Foul Appearance (2025 rulebook p.129) — "Whenever an opposition player
 * attempts to perform a Block Action against this player, or a Special Action
 * that targets this player directly, they must roll a D6 before any other
 * dice are rolled. On a 2+, the Block Action continues as normal. On a 1, the
 * Block Action is immediately cancelled and the opposition player's activation
 * immediately ends."
 *
 * `self` is the target (defender); the roll is made in the attacker's name.
 * (The Special-Action clause lands with the special-action batch.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const FoulAppearanceRule: SkillRule = {
  onBlockDeclared(ctx, self) {
    if (self.id !== ctx.defender.id || !ctx.dice) return;
    const roll = ctx.dice.rollD6(
      `Foul Appearance (${ctx.attacker.playerName})`,
      ctx.attacker.teamId
    );
    if (roll === 1) {
      ctx.cancelled = true;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.FOUL_APPEARANCE,
        effect: "Foul Appearance: the block is cancelled",
      });
    }
  },
};
