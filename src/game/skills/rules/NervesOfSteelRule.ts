import { SkillType } from "../../../types/Skills";
import { type CatchContext, type SkillRule } from "../SkillRule";
import { type Player } from "../../../types/Player";

type MarkedRoll = Pick<CatchContext, "player" | "marking" | "modifiers" | "triggers">;

function ignoreMarking(ctx: MarkedRoll, self: Player, roll: string): void {
  if (self.id !== ctx.player.id || ctx.marking === 0) return;
  ctx.modifiers += ctx.marking;
  ctx.triggers.push({
    playerId: self.id,
    skill: SkillType.NERVES_OF_STEEL,
    effect: `Nerves of Steel: ignores ${String(ctx.marking)} marking modifier(s) on the ${roll}`,
  });
}

export const NervesOfSteelRule: SkillRule = {
  onCatch(ctx, self) {
    ignoreMarking(ctx, self, "catch");
  },
  onPassDeclared(ctx, self) {
    ignoreMarking(ctx, self, "pass");
  },
};
