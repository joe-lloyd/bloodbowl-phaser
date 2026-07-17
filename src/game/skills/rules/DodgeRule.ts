/**
 * Dodge (2025 rulebook p.130) — "Once per Turn, this player may re-roll a
 * single Agility Test when attempting to Dodge. Additionally, this Skill
 * will impact the Stumble result": a Defender Stumbles (pow-dodge) is
 * treated as a Push — the defender is not knocked down — unless the
 * attacker has Tackle (p.140: the defender "does not count as having the
 * Dodge Skill if a Stumble result is selected").
 */

import { SkillType, hasSkill } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const DodgeRule: SkillRule = {
  rerollable: ["dodge"],

  onBlockResult(ctx, self) {
    if (ctx.resultType !== "pow-dodge") return;
    if (self.id !== ctx.defender.id || !ctx.defenderKnockedDown) return;
    if (hasSkill(ctx.attacker.skills, SkillType.TACKLE)) return;

    ctx.defenderKnockedDown = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.DODGE,
      effect: "Dodge: Defender Stumbles becomes a push",
    });
  },
};
