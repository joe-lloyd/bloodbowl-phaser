import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { type SkillRule } from "../SkillRule";

export const TakeRootRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (self.status !== PlayerStatus.ACTIVE) return;
    ctx.gates.push({
      skill: SkillType.TAKE_ROOT,
      target: 2,
      modifier: 0,
      onFail: { kind: "rooted" },
    });
  },
};
