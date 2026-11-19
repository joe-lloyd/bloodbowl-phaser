import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const DauntlessRule: SkillRule = {
  onBlockDeclared(ctx, self) {
    if (self.id !== ctx.attacker.id || !ctx.dice) return;
    const attackerBaseST = self.stats.ST;
    const defenderBaseST = ctx.defender.stats.ST;
    if (defenderBaseST <= attackerBaseST) return;

    const roll = ctx.dice.rollD6(`Dauntless (${self.playerName})`, self.teamId);
    if (roll + attackerBaseST > defenderBaseST) {
      ctx.attackerStrength += defenderBaseST - attackerBaseST;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.DAUNTLESS,
        effect: `Dauntless: matches Strength ${String(defenderBaseST)}`,
      });
    }
  },
};
