/**
 * Dauntless (2025 rulebook p.128) — "When a player with this Skill performs a
 * Block Action against an opposition player with a higher Strength
 * Characteristic (before any modifiers are applied to either player), this
 * player may roll a D6 and add their own Strength Characteristic. If the
 * result is higher than the opposition player's unmodified Strength
 * Characteristic, then this player increases their unmodified Strength
 * Characteristic to match that of the opposition player for the duration of
 * the Block Action. Modifiers are then applied as normal."
 *
 * Works on unmodified (base) strengths; on success the attacker's effective
 * strength rises by the base-strength gap and the block dice are recomputed.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const DauntlessRule: SkillRule = {
  onBlockDeclared(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.dice) return;
    const attackerBaseST = self.stats.ST;
    const defenderBaseST = ctx.defender.stats.ST;
    if (defenderBaseST <= attackerBaseST) return; // only vs a stronger foe

    const roll = ctx.dice.rollD6(
      `Dauntless (${self.playerName})`,
      self.teamId
    );
    if (roll + attackerBaseST > defenderBaseST) {
      ctx.attackerStrength += defenderBaseST - attackerBaseST;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.DAUNTLESS,
        effect: `Dauntless: matches Strength ${defenderBaseST}`,
      });
    }
  },
};
