/**
 * Animosity (X) (2025 rulebook p.123, trait) — "Whenever this player
 * attempts to perform a Pass Action or a Hand-off Action to a team-mate
 * with the same Keyword as the one shown in brackets, roll a D6. On a 1,
 * the player refuses to perform the action and their activation immediately
 * ends. Some players may have the Animosity (all) Trait, in which case they
 * will apply this rule to all of their team-mates."
 *
 * Rolled when the throw/hand-off is attempted (the receiver is known then);
 * the refusal — activation over, ball kept, no turnover — is applied by
 * PassOperation for a Pass, and by HandoffOperation for a Hand-off.
 */

import { SkillType } from "../../../types/Skills";
import { Player } from "../../../types/Player";
import { SkillRule, PassDeclaredContext, HandoffDeclaredContext } from "../SkillRule";
import { matchesKeyword } from "./keywords";

function rollAnimosity(
  ctx: PassDeclaredContext | HandoffDeclaredContext,
  self: Player,
  verb: string
): void {
  if (self.id !== ctx.player.id) return;
  if (!ctx.targetPlayer || !ctx.dice || ctx.refused) return;
  const instance = self.skills.find((s) => s.type === SkillType.ANIMOSITY);
  if (!matchesKeyword(ctx.targetPlayer, instance?.parameter)) return;

  const check = ctx.dice.rollSkillCheck("Animosity", 2, 0, self.playerName);
  if (check.success) return;
  ctx.refused = true;
  ctx.triggers.push({
    playerId: self.id,
    skill: SkillType.ANIMOSITY,
    effect: `Animosity: refuses to ${verb} ${ctx.targetPlayer.playerName} — the activation ends`,
  });
}

export const AnimosityRule: SkillRule = {
  onPassDeclared(ctx, self) {
    rollAnimosity(ctx, self, "throw to");
  },
  onHandoffDeclared(ctx, self) {
    rollAnimosity(ctx, self, "hand off to");
  },
};
