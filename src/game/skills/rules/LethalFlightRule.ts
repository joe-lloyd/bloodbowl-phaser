import { GameConfig } from "../../../config/GameConfig";
import { SkillType, hasSkill } from "../../../types/Skills";
import { type SkillRule } from "../SkillRule";

export const LethalFlightRule: SkillRule = {
  onArmourBreak(ctx, self) {
    if (
      ctx.cause !== "lethal-flight" ||
      ctx.causedBy?.id !== self.id ||
      ctx.player.teamId === self.teamId ||
      !hasSkill(self.skills, SkillType.RIGHT_STUFF)
    ) {
      return;
    }
    const breaksAlready =
      ctx.forcedBreak || ctx.roll + ctx.armourModifier >= ctx.player.stats.AV;
    if (
      !breaksAlready &&
      ctx.roll + ctx.armourModifier + 1 >= ctx.player.stats.AV
    ) {
      ctx.armourModifier += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.LETHAL_FLIGHT,
        effect: "Lethal Flight: +1 to the crash Armour Roll",
      });
    } else {
      ctx.injuryModifier += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.LETHAL_FLIGHT,
        effect: "Lethal Flight: +1 saved for the crash Injury Roll",
      });
    }
  },

  onCasualty(ctx, self) {
    if (
      ctx.cause !== "lethal-flight" ||
      ctx.causedBy?.id !== self.id ||
      ctx.player.teamId === self.teamId ||
      !hasSkill(self.skills, SkillType.RIGHT_STUFF)
    ) {
      return;
    }
    self.spp += GameConfig.SPP_CASUALTY;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.LETHAL_FLIGHT,
      effect: `Lethal Flight: credited with the crash Casualty (+${String(GameConfig.SPP_CASUALTY)} SPP)`,
    });
  },
};
