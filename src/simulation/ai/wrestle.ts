import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type Board, carrierOf } from "./board";

export function bothDownRank(
  attackerBlock: boolean,
  defenderBlock: boolean
): number {
  if (attackerBlock && !defenderBlock) return 4;
  if (attackerBlock) return 2.5;
  return defenderBlock ? 0.5 : 1;
}

export function wrestleValue(
  board: Board,
  attacker: Player,
  defender: Player
): number {
  const carrier = carrierOf(board)?.id;
  if (carrier === attacker.id) return 0;
  return carrier === defender.id ? 4.5 : 2;
}

function hungry(board: Board, attacker: Player): boolean {
  const active = board.gs.getState().activePlayer;
  return active?.id === attacker.id && !!active.bloodlustUnsated;
}

export function takesWrestle(
  board: Board,
  attacker: Player,
  defender: Player
): boolean {
  const block = (p: Player) => hasSkill(p.skills, SkillType.BLOCK);
  return (
    hasSkill(attacker.skills, SkillType.WRESTLE) &&
    (!block(attacker) || block(defender)) &&
    !hungry(board, attacker) &&
    wrestleValue(board, attacker, defender) >
      bothDownRank(block(attacker), block(defender))
  );
}
