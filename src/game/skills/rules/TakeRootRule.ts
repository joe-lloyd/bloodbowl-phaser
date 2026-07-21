/**
 * Take Root (2025 rulebook p.137, trait) — "Whenever this player is
 * activated, after declaring their Action, if they are Standing they must
 * roll a D6. On a 2+, the player may perform the declared Action as normal.
 * On a 1, the player becomes Rooted." A Rooted player may still perform the
 * declared action in place; the condition's movement/push effects and its
 * expiry (Knocked Down, Placed Prone, end of drive) live in the engine —
 * see PlayerCondition.ROOTED.
 */

import { SkillType } from "../../../types/Skills";
import { PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";

export const TakeRootRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    if (self.status !== PlayerStatus.ACTIVE) return; // only when Standing
    ctx.gates.push({
      skill: SkillType.TAKE_ROOT,
      target: 2,
      modifier: 0,
      onFail: { kind: "rooted" },
    });
  },
};
