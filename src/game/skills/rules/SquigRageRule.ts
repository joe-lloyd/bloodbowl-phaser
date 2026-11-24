import { PlayerStatus, type Player } from "../../../types/Player";
import { SkillType, hasSkill } from "../../../types/Skills";
import { chebyshev } from "../../rules/chebyshev";
import { type SkillRule } from "../SkillRule";

export function restrainedByHerder(
  player: Player,
  teammates: Player[]
): boolean {
  const square = player.gridPosition;
  return (
    square !== undefined &&
    teammates.some(
      (mate) =>
        mate.id !== player.id &&
        mate.status === PlayerStatus.ACTIVE &&
        mate.gridPosition !== undefined &&
        chebyshev(square, mate.gridPosition) <= 3 &&
        hasSkill(mate.skills, SkillType.SQUIG_RESTRAINT)
    )
  );
}

export const SquigRageRule: SkillRule = {
  onActivationDeclared({ teammates, gates }, squig) {
    if (restrainedByHerder(squig, teammates)) return;
    gates.push({
      skill: SkillType.SQUIG_RAGE,
      target: 3,
      modifier: 0,
      onFail: { kind: "squigRage" },
    });
  },
};
