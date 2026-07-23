/**
 * Put the Boot In (2025 rulebook p.133) — "This player can provide Offensive
 * Assists when a team-mate performs a Foul Action regardless of how many
 * opposition players are Marking this player."
 *
 * The Foul mirror of Guard: a marked player still lends an offensive assist to
 * a team-mate's Foul. (Guard covers Blocks; this covers Fouls only.)
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const PutTheBootInRule: SkillRule = {
  onCountAssists(ctx, self) {
    if (ctx.action !== "foul") return; // Put the Boot In helps Fouls only
    if (self.id !== ctx.assister.id) return;
    if (!ctx.negated) return;

    ctx.negated = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.PUT_THE_BOOT_IN,
      effect: "Put the Boot In: assists a Foul despite being marked",
    });
  },
};
