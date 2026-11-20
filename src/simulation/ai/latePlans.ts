import { type FieldPlayer as Player } from "./board";
import { blockFaces } from "./wrestle";
import { hasTackleZone } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { playerValue } from "../../types/Team";
import { rushAllowance } from "../../game/skills/movement";
import { BlockValidator } from "../../game/validators/BlockValidator";
import { blockOdds, casualtyChance, twoD6 } from "./chance";
import {
  type Board,
  type Square,
  pitchWidth,
  carrierOf,
  distance,
  toGoal,
} from "./board";
import { movesLeft } from "./routes";
import type { Route } from "./routes";
import type { Context } from "./activationContext";
import type { Available } from "./activations";

const validator = new BlockValidator();

export const nextTurnReach = (player: Player) =>
  player.stats.MA + rushAllowance(player);

export function opponentCanScore(board: Board): boolean {
  const turns = board.opponentTurnsLeft;
  if (turns === 0 || board.ball.kind === "none") return false;
  const goal = (at: Square) => pitchWidth() - 1 - toGoal(board, at);
  const ball = board.ball;
  if (ball.kind === "loose")
    return board.theirs.some(
      (p) =>
        distance(p.gridPosition, ball.at) + goal(ball.at) <=
        turns * nextTurnReach(p)
    );
  if (ball.carrier.teamId === board.us) return true;
  const reach = turns * nextTurnReach(ball.carrier);
  if (goal(ball.at) <= reach) return true;
  return board.theirs.some(
    (mate) =>
      mate.id !== ball.carrier.id &&
      goal(mate.gridPosition) <= turns * nextTurnReach(mate) &&
      distance(ball.at, mate.gridPosition) <=
        reach + (ball.carrier.stats.PA > 0 ? 13 : 1)
  );
}

export function canStillScore(board: Board, available: Available): boolean {
  const carrier = carrierOf(board);
  if (carrier?.teamId !== board.us)
    return scoreWithoutCarrier(board, available);
  const [normal, rushes] = available.has(carrier.id)
    ? movesLeft(board, carrier)
    : [0, 0];
  const carryReach = normal + rushes + board.turnsLeft * nextTurnReach(carrier);
  if (toGoal(board, carrier.gridPosition) <= carryReach) return true;
  return scoreByTransfer({ board, available, carrier, carryReach });
}

export function injuryRiskValue(c: Context, player: Player): number {
  return (
    c.w.ownDown *
    Math.max(1, playerValue(player) / 50_000) *
    (c.board.persistentInjuries ? c.w.seasonInjury : 1)
  );
}

interface LateMoveValueArgs {
  c: Context;
  carrier: Player;
  route: Route;
  ordinary: number;
}

export function lateMoveValue({
  c,
  carrier,
  route,
  ordinary,
}: LateMoveValueArgs): number {
  if (c.goal === "protect" || c.board.turnsLeft === 0) return ordinary;
  if (
    c.board.turnsLeft !== 1 ||
    toGoal(c.board, carrier.gridPosition) <= nextTurnReach(carrier)
  )
    return ordinary;
  if (toGoal(c.board, route.to) > nextTurnReach(carrier))
    return ordinary * c.w.lateProgress;

  return ordinary + route.chance * c.w.touchdown;
}

export function markRisk(c: Context, carrier: Player, at: Square): number {
  const { board } = c;
  const has = (s: SkillType) => hasSkill(carrier.skills, s);
  let marks = 0;
  for (const { opponent, hit } of adjacentBlocks(board, carrier, at)) {
    const theirs = (s: SkillType) => hasSkill(opponent.skills, s);

    const dodges = has(SkillType.DODGE) && !theirs(SkillType.TACKLE);
    const blocks = has(SkillType.BLOCK) && !theirs(SkillType.WRESTLE);
    const perDie = (1 + (dodges ? 0 : 1) + (blocks ? 0 : 1)) / 6;
    const down = hit.isUphill
      ? perDie ** hit.diceCount
      : 1 - (1 - perDie) ** hit.diceCount;
    marks += down / 0.5;
  }
  return marks;
}

export function exposureCost(c: Context, player: Player, at: Square): number {
  const { board } = c;
  if (board.opponentTurnsLeft === 0) return 0;
  let worst = 0;
  for (const { opponent, hit, moved } of adjacentBlocks(board, player, at)) {
    const odds = blockOdds({
      dice: hit.diceCount,
      attackerPicks: !hit.isUphill,
      teamReroll: false,
      faces: blockFaces(board, opponent, moved),
    });
    worst = Math.max(worst, odds.knockdown * casualtyChance(opponent, moved));
  }
  return worst * injuryRiskValue(c, player);
}

export function finalBallLoss(
  c: Context,
  at: Square,
  ballLoss: number
): number {
  const { board } = c;
  const canCollect = board.theirs.some(
    (opponent) =>
      hasTackleZone(opponent) &&
      distance(opponent.gridPosition, at) <= nextTurnReach(opponent)
  );
  const canReply = board.theirs.some((opponent) => {
    if (!hasTackleZone(opponent)) return false;
    const goal =
      board.dir === 1
        ? opponent.gridPosition.x
        : pitchWidth() - 1 - opponent.gridPosition.x;
    return goal <= nextTurnReach(opponent);
  });
  const concedingChangesResult = !board.half2 || board.lead >= 0;
  return board.opponentTurnsLeft > 0 &&
    canCollect &&
    canReply &&
    concedingChangesResult
    ? ballLoss
    : 0;
}

interface ScoringValueArgs {
  c: Context;
  chance: number;
  player: Player;
  ballLoss: number;
  fallChance?: number;
}

export function scoringValue({
  c,
  chance,
  player,
  ballLoss,
  fallChance = 0,
}: ScoringValueArgs): number {
  if (c.board.turnsLeft > 0) {
    return (
      chance * c.w.touchdown -
      (1 - chance) * (c.turnover + c.w.ownDown + ballLoss)
    );
  }
  const { board } = c;
  const at = carrierOf(board)?.gridPosition ?? player.gridPosition;
  const replyCost = finalBallLoss(c, at, ballLoss);
  const fallCasualty =
    twoD6(player.stats.AV) *
    twoD6(hasSkill(player.skills, SkillType.STUNTY) ? 9 : 10) *
    (hasSkill(player.skills, SkillType.REGENERATION) ? 0.5 : 1);
  const personalCost = board.persistentInjuries
    ? fallChance * injuryRiskValue(c, player) * fallCasualty
    : 0;
  return chance * c.w.touchdown - (1 - chance) * replyCost - personalCost;
}

function scoreWithoutCarrier(board: Board, available: Available): boolean {
  if (board.turnsLeft > 1) return true;
  if (board.ball.kind === "none") return false;
  const at = board.ball.at;
  return board.ours.some((player) => {
    if (!available.has(player.id)) return false;
    const [normal, rushes] = movesLeft(board, player);
    return (
      distance(player.gridPosition, at) + toGoal(board, at) <=
      normal + rushes + board.turnsLeft * nextTurnReach(player)
    );
  });
}

function scoreByTransfer({
  board,
  available,
  carrier,
  carryReach,
}: {
  board: Board;
  available: Available;
  carrier: Player;
  carryReach: number;
}): boolean {
  const actions = available.get(carrier.id);
  const canPass = carrier.stats.PA > 0 && actions?.has("pass");
  const canHandoff = actions?.has("handoff");
  if (board.turnsLeft === 0 && !canPass && !canHandoff) return false;
  const transferReach =
    carryReach +
    ((board.turnsLeft > 0 ? carrier.stats.PA > 0 : canPass) ? 13 : 1);
  return board.ours.some((mate) => {
    if (mate.id === carrier.id) return false;
    const turns = board.turnsLeft + (available.has(mate.id) ? 1 : 0);
    return (
      toGoal(board, mate.gridPosition) <= turns * nextTurnReach(mate) &&
      distance(carrier.gridPosition, mate.gridPosition) <= transferReach
    );
  });
}

function* adjacentBlocks(board: Board, player: Player, at: Square) {
  const moved = { ...player, gridPosition: at };
  const everyone = board.everyone.map((p) => (p.id === player.id ? moved : p));
  for (const opponent of board.theirs) {
    if (!hasTackleZone(opponent) || distance(opponent.gridPosition, at) !== 1)
      continue;
    yield {
      opponent,
      moved,
      hit: validator.analyzeBlock({
        attacker: opponent,
        defender: moved,
        allPlayers: everyone,
        activeTeamId: opponent.teamId,
      }),
    };
  }
}
