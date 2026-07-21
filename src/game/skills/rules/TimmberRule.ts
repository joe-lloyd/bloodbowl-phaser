/**
 * Timmm-ber! (2025 rulebook p.137, trait) — "If this player has an MA of 2
 * or less and attempts to stand up, apply a +1 modifier to the roll for
 * standing up for each Open Standing team-mate adjacent to this player. A
 * roll of a natural 1 will still fail as normal." (Open = not being Marked
 * by any opposition player.)
 */

import { SkillType } from "../../../types/Skills";
import {
  Player,
  PlayerStatus,
  hasTackleZone,
} from "../../../types/Player";
import { SkillRule } from "../SkillRule";

const adjacent = (a: Player, b: Player): boolean =>
  !!a.gridPosition &&
  !!b.gridPosition &&
  Math.abs(a.gridPosition.x - b.gridPosition.x) <= 1 &&
  Math.abs(a.gridPosition.y - b.gridPosition.y) <= 1 &&
  !(
    a.gridPosition.x === b.gridPosition.x &&
    a.gridPosition.y === b.gridPosition.y
  );

export const TimmberRule: SkillRule = {
  onStandUpRoll(ctx, self) {
    if (self.id !== ctx.player.id || self.stats.MA > 2) return;
    const helpers = ctx.teammates.filter(
      (mate) =>
        mate.status === PlayerStatus.ACTIVE &&
        adjacent(mate, self) &&
        !ctx.opponents.some((opp) => hasTackleZone(opp) && adjacent(opp, mate))
    ).length;
    if (helpers === 0) return;
    ctx.modifiers += helpers;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TIMMM_BER,
      effect: `Timmm-ber!: +${helpers} to stand up (${helpers} Open helper${helpers > 1 ? "s" : ""})`,
    });
  },
};
