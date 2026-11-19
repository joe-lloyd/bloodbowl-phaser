import { SkillType, hasSkill } from "../../../types/Skills";
import {
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "../../../types/Player";
import { type SkillRule } from "../SkillRule";

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
