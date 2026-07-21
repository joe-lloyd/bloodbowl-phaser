/**
 * Bone Head (2025 rulebook p.126, trait) — "Whenever this player is
 * activated, after declaring their Action they must roll a D6. On a 2+, the
 * player may perform the declared Action as normal. On a 1, the player
 * becomes Distracted." Becoming Distracted ends the activation — the
 * declared action is not performed (Distracted: no Tackle Zone until next
 * activated; see PlayerCondition).
 */

import { SkillType } from "../../../types/Skills";
import { SkillRule } from "../SkillRule";

export const BoneHeadRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    ctx.gates.push({
      skill: SkillType.BONE_HEAD,
      target: 2,
      modifier: 0,
      onFail: { kind: "distracted" },
    });
  },
};
