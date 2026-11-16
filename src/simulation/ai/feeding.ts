/** Feeding depends on native Thrall Linemen and the action's endpoint. */
import { Player, PositionKeyWord, TraitKeyWord } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { ActionType } from "../../types/events";
import { Board, Square, carrierOf, distance } from "./board";
import { d6 } from "./chance";
import type { Context } from "./activationContext";

export function isThrall(player: Player): boolean {
  return (
    player.keywords.includes(TraitKeyWord.THRALL) &&
    player.keywords.includes(PositionKeyWord.LINEMAN)
  );
}

export function hasBiteSupport(
  board: Board,
  player: Player,
  at: Square
): boolean {
  return board.ours.some(
    (p) =>
      p.id !== player.id &&
      p.id !== carrierOf(board)?.id &&
      isThrall(p) &&
      distance(p.gridPosition!, at) === 1
  );
}

function bloodlustFailure(
  c: Context,
  player: Player,
  action: ActionType
): number {
  if (!c.skillPlans || !hasSkill(player.skills, SkillType.BLOODLUST)) return 0;
  const active = c.board.gs.getState().activePlayer;
  if (active?.id === player.id) {
    if (active.bloodlustUnsated) return 1;
    if (active.committed) return 0;
  }
  const parameter = player.skills.find(
    (s) => s.type === SkillType.BLOODLUST
  )?.parameter;
  const threshold = parseInt(String(parameter ?? "3"), 10) || 3;
  const angry = action === "block" || action === "blitz";
  return 1 - d6(threshold - (angry ? 1 : 0));
}

export function unfedChance(
  c: Context,
  player: Player,
  action: ActionType,
  at: Square
): number {
  return hasBiteSupport(c.board, player, at)
    ? 0
    : bloodlustFailure(c, player, action);
}

export function feedingCost(
  c: Context,
  player: Player,
  action: ActionType,
  at: Square,
  carrying = carrierOf(c.board)?.id === player.id
): number {
  const { board, w } = c;
  const failure = bloodlustFailure(c, player, action);
  if (failure === 0) return 0;
  const support = hasBiteSupport(board, player, at);
  return (
    failure *
    (support ? w.ownDown : c.turnover + w.ownDown + (carrying ? w.ballLoss : 0))
  );
}

/** New moves pay once; a committed move compares against ending here. */
export function moveFeedingCost(
  c: Context,
  player: Player,
  at: Square
): number {
  const active = c.board.gs.getState().activePlayer;
  const owed =
    active?.id === player.id && active.committed
      ? feedingCost(c, player, "move", player.gridPosition!)
      : 0;
  return feedingCost(c, player, "move", at) - owed;
}
