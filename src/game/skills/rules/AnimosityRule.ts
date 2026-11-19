import { SkillType } from "../../../types/Skills";
import { type Player } from "../../../types/Player";
import {
  type SkillRule,
  type PassDeclaredContext,
  type HandoffDeclaredContext,
} from "../SkillRule";
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

  const check = ctx.dice.rollSkillCheck({ reason: "Animosity",target: 2,modifier: 0,playerName: self.playerName });
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
