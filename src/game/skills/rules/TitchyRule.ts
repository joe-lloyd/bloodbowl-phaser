/**
 * Titchy (2025 rulebook p.138) — "A player with this Trait may apply a +1
 * modifier to the Agility Test when attempting to Dodge. However, when an
 * opposition player attempts to Dodge into a square within this player's
 * Tackle Zone, this player will not apply a -1 modifier to the opposition
 * player's Agility Test for Marking the opposition player."
 *
 * The dodge fold gathers markers of the destination square, so `self` may
 * be a Titchy player whose marking must be forgiven. The forgiveness is
 * bounded by `markingPenalty` so it never stacks past the real marking
 * modifier (and stays idle when Stunty already forgave all marking).
 */

import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";

export const TitchyRule: SkillRule = {
  onDodgeDeclared(ctx, self) {
    if (self.id === ctx.player.id) {
      ctx.modifiers += 1;
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.TITCHY,
        effect: "Titchy: +1 to the dodge",
      });
      return;
    }

    // An opposing Titchy player marking the DESTINATION square does not
    // apply its -1 marking modifier to the dodge.
    if (self.teamId === ctx.player.teamId) return;
    if (self.status !== PlayerStatus.ACTIVE || !self.gridPosition) return;
    if (ctx.markingPenalty >= 0) return; // all marking already forgiven
    const dx = Math.abs(self.gridPosition.x - ctx.to.x);
    const dy = Math.abs(self.gridPosition.y - ctx.to.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) return;

    ctx.modifiers += 1;
    ctx.markingPenalty += 1;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TITCHY,
      effect: "Titchy: does not count as Marking the dodge",
    });
  },
};
