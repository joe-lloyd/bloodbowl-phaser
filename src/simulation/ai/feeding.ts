import { type FieldPlayer as Player } from "./board";
import {
  type Player as RosterPlayer,
  PositionKeyWord,
  TraitKeyWord,
} from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type ActionType } from "../../types/events";
import { type Board, type Square, carrierOf, distance } from "./board";
import { d6 } from "./chance";
import type { Context } from "./activationContext";

export function isThrall(player: RosterPlayer): boolean {
  return (
    player.keywords.includes(TraitKeyWord.THRALL) &&
    player.keywords.includes(PositionKeyWord.LINEMAN)
  );
}

export function hasBiteSupport(
  board: Board,
  player: RosterPlayer,
  at: Square
): boolean {
  return board.ours.some(
    (p) =>
      p.id !== player.id &&
      p.id !== carrierOf(board)?.id &&
      isThrall(p) &&
      distance(p.gridPosition, at) === 1
  );
}

function bloodlustFailure(
  c: Context,
  player: RosterPlayer,
  action: ActionType
): number {
  if (!c.skillPlans || !hasSkill(player.skills, SkillType.BLOODLUST)) return 0;
  const active = c.board.gs.getState().activePlayer;
  if (active?.id === player.id) {
    if (active.bloodlustUnsated) return 1;
    if (active.committed) return 0;
  }
  return bloodlustRoll(player, action);
}

function bloodlustRoll(player: RosterPlayer, action: ActionType): number {
  const parameter = player.skills.find(
    (s) => s.type === SkillType.BLOODLUST
  )?.parameter;
  const threshold = parseInt(String(parameter ?? "3"), 10) || 3;
  const angry = action === "block" || action === "blitz";
  return 1 - d6(threshold - (angry ? 1 : 0));
}

interface UnfedChanceArgs {
  c: Context;
  player: RosterPlayer;
  action: ActionType;
  at: Square;
}

export function unfedChance({
  c,
  player,
  action,
  at,
}: UnfedChanceArgs): number {
  return hasBiteSupport(c.board, player, at)
    ? 0
    : bloodlustFailure(c, player, action);
}

interface FeedingCostArgs {
  c: Context;
  player: RosterPlayer;
  action: ActionType;
  at: Square;
  carrying?: boolean;
}

export function feedingCost({
  c,
  player,
  action,
  at,
  carrying = carrierOf(c.board)?.id === player.id,
}: FeedingCostArgs): number {
  const { board, w } = c;
  const failure = bloodlustFailure(c, player, action);
  if (failure === 0) return 0;
  const support = hasBiteSupport(board, player, at);
  return (
    failure *
    (support ? w.ownDown : c.turnover + w.ownDown + (carrying ? w.ballLoss : 0))
  );
}

export function moveFeedingCost(
  c: Context,
  player: Player,
  at: Square
): number {
  const active = c.board.gs.getState().activePlayer;
  const owed =
    active?.id === player.id && active.committed
      ? feedingCost({
          c: c,
          player: player,
          action: "move",
          at: player.gridPosition,
        })
      : 0;
  return feedingCost({ c: c, player: player, action: "move", at: at }) - owed;
}
