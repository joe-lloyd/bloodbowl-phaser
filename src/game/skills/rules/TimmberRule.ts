import { SkillType, hasSkill } from "../../../types/Skills";
import {
  type Player,
  PlayerStatus,
  hasTackleZone,
} from "../../../types/Player";
import { type SkillRule } from "../SkillRule";
import { STAND_UP_TARGET } from "../movement";
import { requiredRoll } from "../../rules/rollTargets";

const adjacent = (a: Player, b: Player): boolean =>
  !!a.gridPosition &&
  !!b.gridPosition &&
  Math.abs(a.gridPosition.x - b.gridPosition.x) <= 1 &&
  Math.abs(a.gridPosition.y - b.gridPosition.y) <= 1 &&
  !(
    a.gridPosition.x === b.gridPosition.x &&
    a.gridPosition.y === b.gridPosition.y
  );

interface Riser {
  player: Player;
  teammates: Player[];
  opponents: Player[];
}

function openHelpers({ player, teammates, opponents }: Riser): number {
  return teammates.filter(
    (mate) =>
      mate.status === PlayerStatus.ACTIVE &&
      adjacent(mate, player) &&
      !opponents.some((opp) => hasTackleZone(opp) && adjacent(opp, mate))
  ).length;
}

export function standUpTarget(riser: Riser): number | null {
  const { player } = riser;
  if (player.stats.MA >= 3) return null;
  const helped = hasSkill(player.skills, SkillType.TIMMM_BER);
  return requiredRoll(STAND_UP_TARGET, helped ? openHelpers(riser) : 0);
}

export const TimmberRule: SkillRule = {
  onStandUpRoll(ctx, self) {
    if (self.id !== ctx.player.id || self.stats.MA > 2) return;
    const helpers = openHelpers(ctx);
    if (helpers === 0) return;
    ctx.modifiers += helpers;
    ctx.triggers.push({
      playerId: self.id,
      skill: SkillType.TIMMM_BER,
      effect: `Timmm-ber!: +${String(helpers)} to stand up (${String(helpers)} Open helper${helpers > 1 ? "s" : ""})`,
    });
  },
};
