import { SkillType } from "../../../types/Skills";
import { type Player, PlayerStatus } from "../../../types/Player";
import { type SkillRule } from "../SkillRule";

const within3 = (a: Player, b: Player): boolean =>
  !!a.gridPosition &&
  !!b.gridPosition &&
  Math.abs(a.gridPosition.x - b.gridPosition.x) <= 3 &&
  Math.abs(a.gridPosition.y - b.gridPosition.y) <= 3;

export const PickMeUpRule: SkillRule = {
  onTurnEnding(ctx, self) {
    if (self.status !== PlayerStatus.ACTIVE) return;
    for (const mate of ctx.players) {
      if (mate.id === self.id || mate.status !== PlayerStatus.PRONE) continue;
      if (ctx.rolledFor.has(mate.id) || !within3(self, mate)) continue;
      ctx.rolledFor.add(mate.id);
      const check = ctx.dice.rollSkillCheck(
        { reason: "Pick-Me-Up",target: 5,modifier: 0,playerName: mate.playerName }      );
      if (!check.success) continue;
      ctx.standUp.push(mate.id);
      ctx.triggers.push({
        playerId: self.id,
        skill: SkillType.PICK_ME_UP,
        effect: `Pick-Me-Up: ${mate.playerName} stands up`,
      });
    }
  },
};
