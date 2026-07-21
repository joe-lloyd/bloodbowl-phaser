/**
 * Monstrous Mouth (2025 rulebook p.131, Mutation) — the Chomp Special
 * Action: "select one Standing opposition player they are Marking and roll
 * a D6. On a 1-2 nothing happens. On a 3+, the opposition player is ...
 * Chomped. Whilst Chomped, the opposition player cannot leave the square
 * they are in whilst this player remains Marking them. ... may use the
 * Chomp Special Action to replace the Block Action made as part of a Blitz
 * Action. Additionally, the Strip Ball Skill cannot be used against this
 * player."
 *
 * The Chomp action lives in ChompOperation (declared like Stab); the
 * Chomped condition's movement lock and expiry live in the engine. This
 * rule carries the passive clause: Strip Ball never bites this player.
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const MonstrousMouthRule: SkillRule = {
  onPush(ctx, self) {
    if (self.id !== ctx.pushed.id || !ctx.stripBall) return;
    ctx.stripBall = false;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.MONSTROUS_MOUTH,
      effect: "Monstrous Mouth: Strip Ball cannot be used against this player",
    });
  },
};
