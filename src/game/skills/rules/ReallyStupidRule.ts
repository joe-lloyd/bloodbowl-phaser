/**
 * Really Stupid (2025 rulebook p.135, trait) — "Whenever this player is
 * activated, after declaring their Action, they must roll a D6. They may
 * apply a +2 modifier to the roll if they have any Standing team-mates who
 * are not Distracted, and do not have the Really Stupid Trait, adjacent to
 * them. On a 4+, the player may perform the declared Action as normal. On a
 * 1-3, this player becomes Distracted."
 */

import { SkillType, hasSkill } from "../../../types/Skills";
import {
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "../../../types/Player";
import { SkillRule } from "../SkillRule";

export const ReallyStupidRule: SkillRule = {
  onActivationDeclared(ctx, self) {
    if (self.id !== ctx.player.id) return;
    const helper = ctx.teammates.some(
      (p) =>
        p.gridPosition &&
        self.gridPosition &&
        Math.abs(p.gridPosition.x - self.gridPosition.x) <= 1 &&
        Math.abs(p.gridPosition.y - self.gridPosition.y) <= 1 &&
        p.status === PlayerStatus.ACTIVE &&
        !hasCondition(p, PlayerCondition.DISTRACTED) &&
        !hasSkill(p.skills, SkillType.REALLY_STUPID)
    );
    ctx.gates.push({
      skill: SkillType.REALLY_STUPID,
      target: 4,
      modifier: helper ? 2 : 0,
      onFail: { kind: "distracted" },
    });
  },
};
