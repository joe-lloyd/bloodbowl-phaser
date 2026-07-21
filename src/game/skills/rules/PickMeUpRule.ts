/**
 * Pick-Me-Up (2025 rulebook p.132, trait) — "At the end of each of the
 * opposition's Turns, roll a D6 for each Prone team-mate within 3 squares
 * of one or more Standing players with this Trait. On a 5+, the Prone
 * player may immediately stand up. Should a player with this Trait stand up
 * as a result of a team-mate using this Trait, they may not also use this
 * Trait during the same Turn."
 *
 * Folded synchronously in the end-of-turn trigger. Stand-ups are applied by
 * the engine AFTER the whole fold, so a holder stood up during this pass is
 * still Prone while later holders fold — the "may not also use it" clause
 * holds by construction. Each Prone player rolls at most once per pass
 * (ctx.rolledFor).
 */

import { SkillType } from "../../../types/Skills";
import { Player, PlayerStatus } from "../../../types/Player";
import { SkillRule } from "../SkillRule";

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
        "Pick-Me-Up",
        5,
        0,
        mate.playerName
      );
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
