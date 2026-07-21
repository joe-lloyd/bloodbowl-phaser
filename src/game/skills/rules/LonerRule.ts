/**
 * Loner (X+) (2025 rulebook p.131, trait) — "Whenever this player wishes to
 * use a Team Re-roll, they must roll a D6. If they roll equal to or higher
 * than the number shown in brackets, then they may use the Team Re-roll as
 * normal. If they roll lower ... they may not re-roll the dice and the Team
 * Re-roll is lost just as if it had been used." Parameter-aware: one rule
 * serves Loner (3+/4+/5+); the reroll machinery consumes the team reroll
 * either way (see rerolls.ts onTeamRerollGate fold).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const LonerRule: SkillRule = {
  onTeamRerollGate(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const instance = self.skills.find((s) => s.type === SkillType.LONER);
    const threshold = parseInt(String(instance?.parameter ?? "4"), 10) || 4;
    const check = ctx.dice.rollSkillCheck(
      "Loner",
      threshold,
      0,
      self.playerName
    );
    if (check.success) return;
    ctx.allowed = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.LONER,
      effect: `Loner (${threshold}+): the Team Re-roll is lost unspent`,
    });
  },
};
