/** Scoring horizons and player exposure use the actual Sevens match context. */
import { Player, hasTackleZone } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { playerValue } from "../../types/Team";
import { rushAllowance } from "../../game/skills/movement";
import { BlockValidator } from "../../game/validators/BlockValidator";
import { blockOdds, casualtyChance, twoD6 } from "./chance";
import { Board, Square, WIDTH, carrierOf, distance, toGoal } from "./board";
import { movesLeft } from "./routes";
import type { Route } from "./routes";
import type { Context } from "./activationContext";
import type { Available } from "./activations";

const validator = new BlockValidator();

export const nextTurnReach = (player: Player) =>
  player.stats.MA + rushAllowance(player);

/** An optimistic supported horizon prevents premature defensive surrender. */
export function canStillScore(board: Board, available: Available): boolean {
  const carrier = carrierOf(board);
  if (!carrier || carrier.teamId !== board.us) {
    if (board.turnsLeft > 1) return true;
    if (board.ball.kind === "none") return false;
    const at = board.ball.at;
    return board.ours.some((player) => {
      if (!available.has(player.id)) return false;
      const [normal, rushes] = movesLeft(board, player);
      return (
        distance(player.gridPosition!, at) + toGoal(board, at) <=
        normal + rushes + board.turnsLeft * nextTurnReach(player)
      );
    });
  }
  const [normal, rushes] = available.has(carrier.id)
    ? movesLeft(board, carrier)
    : [0, 0];
  const carryReach = normal + rushes + board.turnsLeft * nextTurnReach(carrier);
  if (toGoal(board, carrier.gridPosition!) <= carryReach) return true;
  const transferReach = carryReach + (carrier.stats.PA > 0 ? 13 : 1);
  return board.ours.some((mate) => {
    if (mate.id === carrier.id || !mate.gridPosition) return false;
    const turns = board.turnsLeft + (available.has(mate.id) ? 1 : 0);
    return (
      toGoal(board, mate.gridPosition) <= turns * nextTurnReach(mate) &&
      distance(carrier.gridPosition!, mate.gridPosition) <= transferReach
    );
  });
}

/** Expected permanent-loss cost rises with player value in persistent matches. */
export function injuryRiskValue(c: Context, player: Player): number {
  return (
    c.w.ownDown *
    Math.max(1, playerValue(player) / 50_000) *
    (c.board.persistentInjuries ? c.w.seasonInjury : 1)
  );
}

/** Turn-five progress is useful chiefly when it leaves a final-turn scoring reach. */
export function lateMoveValue(
  c: Context,
  carrier: Player,
  route: Route,
  ordinary: number
): number {
  if (c.goal === "protect" || c.board.turnsLeft === 0) return ordinary;
  if (
    c.board.turnsLeft !== 1 ||
    toGoal(c.board, carrier.gridPosition!) <= nextTurnReach(carrier)
  )
    return ordinary;
  if (toGoal(c.board, route.to) > nextTurnReach(carrier))
    return ordinary * c.w.lateProgress;
  // Preparing a score adds value to the complete move. Keep its destination
  // safety and loss costs so equally reachable endpoints still compete.
  return ordinary + route.chance * c.w.touchdown;
}

/** The most damaging adjacent reply, including actual strength and assists. */
export function exposureCost(c: Context, player: Player, at: Square): number {
  const { board } = c;
  if (board.opponentTurnsLeft === 0) return 0;
  const moved = { ...player, gridPosition: at };
  const everyone = board.everyone.map((p) => (p.id === player.id ? moved : p));
  let worst = 0;
  for (const opponent of board.theirs) {
    if (!hasTackleZone(opponent) || distance(opponent.gridPosition!, at) !== 1)
      continue;
    const hit = validator.analyzeBlock(
      opponent,
      moved,
      everyone,
      opponent.teamId
    );
    const odds = blockOdds(
      opponent,
      moved,
      hit.diceCount,
      !hit.isUphill,
      false
    );
    worst = Math.max(worst, odds.knockdown * casualtyChance(opponent, moved));
  }
  return worst * injuryRiskValue(c, player);
}

/** Final-turn failure does not automatically lose a future possession or turn. */
export function scoringValue(
  c: Context,
  chance: number,
  player: Player,
  ballLoss: number,
  fallChance = 0
): number {
  if (c.board.turnsLeft > 0) {
    return (
      chance * c.w.touchdown -
      (1 - chance) * (c.turnover + c.w.ownDown + ballLoss)
    );
  }
  const { board } = c;
  const carrier = carrierOf(board);
  const at = carrier?.gridPosition ?? player.gridPosition!;
  const canCollect = board.theirs.some(
    (opponent) =>
      hasTackleZone(opponent) &&
      distance(opponent.gridPosition!, at) <= nextTurnReach(opponent)
  );
  const canReply = board.theirs.some((opponent) => {
    if (!hasTackleZone(opponent)) return false;
    const goal =
      board.dir === 1
        ? opponent.gridPosition!.x
        : WIDTH - 1 - opponent.gridPosition!.x;
    return goal <= nextTurnReach(opponent);
  });
  const concedingChangesResult = !board.half2 || board.lead >= 0;
  const replyCost =
    board.opponentTurnsLeft > 0 &&
    canCollect &&
    canReply &&
    concedingChangesResult
      ? ballLoss
      : 0;
  const fallCasualty =
    twoD6(player.stats.AV) *
    twoD6(hasSkill(player.skills, SkillType.STUNTY) ? 9 : 10) *
    (hasSkill(player.skills, SkillType.REGENERATION) ? 0.5 : 1);
  const personalCost = board.persistentInjuries
    ? fallChance * injuryRiskValue(c, player) * fallCasualty
    : 0;
  return chance * c.w.touchdown - (1 - chance) * replyCost - personalCost;
}
