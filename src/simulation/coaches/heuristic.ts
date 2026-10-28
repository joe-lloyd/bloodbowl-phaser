/**
 * A coach that plays recognisable Blood Bowl: carry the ball forward, pick
 * it up when it is loose, throw good blocks, chase the opposing carrier,
 * and avoid needless dodges and rushes.
 *
 * It is not trying to win tournaments. It exists so full matches reach the
 * situations real coaches create (touchdowns, turnovers, cage breaks, deep
 * injuries) far more often than the random fuzzer does.
 */

import { HeadlessCommand, GridPosition } from "../../headless/protocol";
import { Player, PlayerStatus } from "../../types/Player";
import { BlockResultType } from "../../services/BlockResolutionService";
import { GameService } from "../../services/GameService";
import { Candidate } from "../candidates";
import { Coach, CoachContext } from "../coach";
import { GameConfig } from "../../config/GameConfig";

const BLOCK_RANK: Record<BlockResultType, number> = {
  pow: 5,
  "pow-dodge": 4,
  push: 3,
  "both-down": 1,
  skull: 0,
};

const chebyshev = (a: GridPosition, b: GridPosition) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Board facts every candidate is scored against, read once per decision. */
interface Board {
  gs: GameService;
  teamId: string;
  team1Id: string;
  ball: GridPosition | null;
  /** The player standing on the ball, if any. */
  carrier: Player | undefined;
}

export function scoreCandidate(candidate: Candidate, board: Board): number {
  const command = candidate.commands[0];
  switch (candidate.kind) {
    case "end-turn":
      return 1;
    case "end-activation":
      return 2;
    case "setup":
      return candidate.label.includes("Balanced") ? 10 : 5;
    case "kickoff":
      return command.type === "kick-ball" && command.y === 5
        ? 10 - Math.abs(command.x - 10) / 10
        : 5;
    case "declare":
      return scoreDeclaration(command, board);
    case "step":
      return scoreStep(command, board);
    case "decision":
      return scoreDecision(command, board);
  }
}

/** Squares from this team's scoring end zone (team1 scores at the far right). */
function distanceToGoal(
  board: Board,
  teamId: string,
  at: GridPosition
): number {
  return teamId === board.team1Id ? GameConfig.PITCH_WIDTH - 1 - at.x : at.x;
}

function tackleZonesOn(board: Board, teamId: string, at: GridPosition): number {
  return board.gs
    .getOpponents(teamId)
    .filter(
      (o) =>
        o.gridPosition &&
        o.status === PlayerStatus.ACTIVE &&
        chebyshev(o.gridPosition, at) === 1
    ).length;
}

function scoreDeclaration(command: HeadlessCommand, board: Board): number {
  if (command.type !== "declare-action") return 0;
  const player = board.gs.getPlayerById(command.playerId);
  if (!player?.gridPosition) return 0;
  const at = player.gridPosition;
  const ours = board.carrier?.teamId === board.teamId;
  const isCarrier = board.carrier?.id === player.id;
  const reach = player.stats.MA + 2;

  if (command.blockReplacement) return 25;
  switch (command.action) {
    case "move":
      if (isCarrier) {
        return distanceToGoal(board, player.teamId, at) <= reach ? 300 : 100;
      }
      if (!board.carrier && board.ball) {
        return 80 - chebyshev(at, board.ball) * 5;
      }
      return 20 - (board.ball ? chebyshev(at, board.ball) : 0);
    case "block":
      return bestBlockValue(player, board);
    case "blitz":
      if (
        board.carrier &&
        !ours &&
        chebyshev(at, board.carrier.gridPosition!) <= reach
      ) {
        return 90;
      }
      return 10;
    case "standUp":
      return 15;
    case "pass":
    case "handoff":
      return isCarrier ? 30 : 0;
    case "foul":
      return 8;
    default:
      return 3;
  }
}

function bestBlockValue(player: Player, board: Board): number {
  const at = player.gridPosition!;
  let best = 0;
  for (const target of board.gs.getOpponents(player.teamId)) {
    if (!target.gridPosition || target.status !== PlayerStatus.ACTIVE) continue;
    if (chebyshev(target.gridPosition, at) !== 1) continue;
    const diff = player.stats.ST - target.stats.ST;
    let value = diff > 0 ? 60 : diff === 0 ? 30 : 5;
    if (board.carrier?.id === target.id) value += 40;
    best = Math.max(best, value);
  }
  return best;
}

/** How good it is to stand on `at`, for the active player's plan. */
function squareValue(player: Player, at: GridPosition, board: Board): number {
  const isCarrier = board.carrier?.id === player.id;
  const action = board.gs.getState().activePlayer?.action;
  if (isCarrier) return -distanceToGoal(board, player.teamId, at) * 10;
  if (board.ball && !board.carrier) return -chebyshev(at, board.ball) * 10;
  if (board.carrier && board.carrier.teamId !== player.teamId) {
    return (
      -chebyshev(at, board.carrier.gridPosition!) *
      (action === "blitz" ? 12 : 6)
    );
  }
  if (board.carrier) {
    // Support: get one square ahead of our own carrier.
    const goal = board.carrier.gridPosition!;
    const ahead = {
      x: goal.x + (player.teamId === board.team1Id ? 1 : -1),
      y: goal.y,
    };
    return -chebyshev(at, ahead) * 4;
  }
  return 0;
}

function scoreStep(command: HeadlessCommand, board: Board): number {
  const gs = board.gs;
  switch (command.type) {
    case "move": {
      const player = gs.getPlayerById(command.playerId)!;
      const from = player.gridPosition!;
      const to = command.path[command.path.length - 1];
      let value =
        squareValue(player, to, board) - squareValue(player, from, board);
      if (tackleZonesOn(board, player.teamId, from) > 0) value -= 15; // a dodge
      value -= tackleZonesOn(board, player.teamId, to) * 3;
      if (gs.getMovementUsed(player.id) >= player.stats.MA) value -= 20; // a rush
      const scores =
        board.carrier?.id === player.id &&
        distanceToGoal(board, player.teamId, to) === 0;
      return scores ? 1000 : value;
    }
    case "block": {
      const attacker = gs.getPlayerById(command.attackerId)!;
      const defender = gs.getPlayerById(command.defenderId)!;
      const diff = attacker.stats.ST - defender.stats.ST;
      const carrierBonus = board.carrier?.id === defender.id ? 40 : 0;
      return (diff > 0 ? 50 : diff === 0 ? 20 : -5) + carrierBonus;
    }
    case "stab":
    case "special-action":
      return 30;
    case "pass":
    case "handoff": {
      const passer = gs.getPlayerById(command.playerId)!;
      const target =
        command.type === "handoff"
          ? gs.getPlayerById(command.targetId)!.gridPosition!
          : { x: command.x, y: command.y };
      const gain =
        distanceToGoal(board, passer.teamId, passer.gridPosition!) -
        distanceToGoal(board, passer.teamId, target);
      const receiver = [
        ...gs.getTeammates(passer.id),
        ...gs.getOpponents(passer.teamId),
      ].find(
        (p) => p.gridPosition?.x === target.x && p.gridPosition?.y === target.y
      );
      // Only ever aim at a standing team-mate; anything else gives the ball away.
      const aimPenalty =
        receiver?.teamId === passer.teamId &&
        receiver.status === PlayerStatus.ACTIVE
          ? 0
          : 200;
      return (
        gain * 8 - tackleZonesOn(board, passer.teamId, target) * 10 - aimPenalty
      );
    }
    case "jump": {
      // A Jump is an Agility test: worth it only to make real progress.
      const player = gs.getPlayerById(command.playerId)!;
      const to = { x: command.x, y: command.y };
      return (
        squareValue(player, to, board) -
        squareValue(player, player.gridPosition!, board) -
        25
      );
    }
    case "foul":
      return 10;
    case "stand-up":
      return 15;
    default:
      return 0;
  }
}

function scoreDecision(command: HeadlessCommand, board: Board): number {
  const gs = board.gs;
  switch (command.type) {
    case "choose-block-result": // ranked in blockDieScores
    case "team-reroll-block":
    case "pro-reroll-block":
    case "brawler-reroll-block":
    case "veteran-reroll-block":
      return -1;
    case "choose-push-direction": {
      // Push towards the sideline: crowd pushes injure.
      return Math.abs(command.y - (GameConfig.PITCH_HEIGHT - 1) / 2);
    }
    case "choose-follow-up":
      return command.followUp ? 1 : 0;
    case "use-reroll":
      return command.accept ? (command.source === "skill" ? 3 : 2) : 0;
    case "use-reaction":
    case "use-apothecary":
      return command.accept ? 1 : 0;
    case "choose-inducement":
      // Use a Desperate Measure as soon as it is offered.
      return command.playerId ? 1 : 0;
    case "choose-interception":
      return command.playerId ? 1 : 0;
    case "touchback": {
      const player = gs.getPlayerById(command.playerId)!;
      return -tackleZonesOn(board, player.teamId, player.gridPosition!);
    }
    case "kickoff-skip":
      return 1;
    default:
      return 0;
  }
}

/** Block dice need the pending options, so they are ranked separately. */
function blockDieScores(context: CoachContext, board: Board): number[] | null {
  const pending = context.point.pending;
  if (pending?.type !== "block-dice") return null;
  const attacker = board.gs.getPlayerById(pending.attackerId);
  const attackerChooses = attacker?.teamId === pending.chooserTeamId;
  const best = Math.max(...pending.options.map((o) => BLOCK_RANK[o.type]));
  return context.point.candidates.map((candidate) => {
    const command = candidate.commands[0];
    if (command.type === "choose-block-result") {
      const rank = BLOCK_RANK[pending.options[command.index].type];
      return attackerChooses ? rank : 5 - rank;
    }
    // Re-roll only a block that would otherwise turn over.
    if (command.type === "team-reroll-block") return best <= 1 ? 2 : -1;
    // The Veteran's re-roll is only offered when the block would knock them
    // down, so it is always worth more than a Team Re-roll.
    if (command.type === "veteran-reroll-block") return 3;
    return -1;
  });
}

export function readBoard(context: CoachContext): Board {
  const gs = context.game.ctx.gameService;
  const state = gs.getState();
  const ball = state.ballPosition ? { ...state.ballPosition } : null;
  const carrier = ball
    ? [
        ...context.game.ctx.team1.players,
        ...context.game.ctx.team2.players,
      ].find(
        (p) =>
          p.gridPosition &&
          p.status === PlayerStatus.ACTIVE &&
          p.gridPosition.x === ball.x &&
          p.gridPosition.y === ball.y
      )
    : undefined;
  return {
    gs,
    teamId: context.point.teamId,
    team1Id: context.game.ctx.team1.id,
    ball,
    carrier,
  };
}

/** Candidate scores with a little noise so equal options do not always tie the same way. */
export function rankCandidates(context: CoachContext): number[] {
  const board = readBoard(context);
  const scores =
    blockDieScores(context, board) ??
    context.point.candidates.map((c) => scoreCandidate(c, board));
  return scores.map((score) => score + context.rng.next() * 0.5);
}

export const heuristicCoach: Coach = {
  name: "heuristic",
  async choose(context) {
    const scores = rankCandidates(context);
    let index = 0;
    scores.forEach((score, i) => {
      if (score > scores[index]) index = i;
    });
    return { index };
  },
};
