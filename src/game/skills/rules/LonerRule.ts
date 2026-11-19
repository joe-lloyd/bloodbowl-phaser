import { SkillType } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const LonerRule: SkillRule = {
  onTeamRerollGate(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const instance = self.skills.find((s) => s.type === SkillType.LONER);
    const threshold = parseInt(String(instance?.parameter ?? "4"), 10) || 4;
    const check = ctx.dice.rollSkillCheck(
      { reason: "Loner",target: threshold,modifier: 0,playerName: self.playerName }    );
    if (check.success) return;
    ctx.allowed = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.LONER,
      effect: `Loner (${String(threshold)}+): the Team Re-roll is lost unspent`,
    });
  },
};
