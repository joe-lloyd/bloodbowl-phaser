import { type FieldPlayer, onField } from "../ai/board";
import { setupLabel } from "../../game/setup/deployment";
import {
  type HeadlessCommand,
  type GridPosition,
} from "../../headless/protocol";
import { type Player, PlayerStatus } from "../../types/Player";
import { type BlockResultType } from "../../services/BlockResolutionService";
import { GameService } from "../../services/GameService";
import { type Candidate } from "../candidates";
import { type Coach, type CoachContext } from "../coach";
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

interface Board {
  gs: GameService;
  teamId: string;
  team1Id: string;
  ball: GridPosition | null;

  carrier: FieldPlayer | undefined;
}

function scoreCandidate(candidate: Candidate, board: Board): number {
  const command = candidate.commands[0];
  switch (candidate.kind) {
    case "end-turn":
      return 1;
    case "end-activation":
      return 2;
    case "setup":
      return candidate.label === setupLabel("Balanced") ? 10 : 5;
    case "kickoff":
      return kickoffValue(command);
    case "declare":
      return scoreDeclaration(command, board);
    case "step":
      return hasCommandType(command, STEP_TYPES)
        ? scoreStep(command, board)
        : 0;
    case "decision":
      return scoreDecision(command, board);
  }
}

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

type CommandOf<T extends HeadlessCommand["type"]> = Extract<
  HeadlessCommand,
  { type: T }
>;

const reachOf = (player: Player) => player.stats.MA + 2;

function moveDeclarationValue(
  player: Player,
  at: GridPosition,
  board: Board
): number {
  if (board.carrier?.id === player.id) {
    return distanceToGoal(board, player.teamId, at) <= reachOf(player)
      ? 300
      : 100;
  }
  if (!board.carrier && board.ball) {
    return 80 - chebyshev(at, board.ball) * 5;
  }
  const reposition = 20 - (board.ball ? chebyshev(at, board.ball) : 0);
  return player.status === PlayerStatus.PRONE
    ? Math.max(15, reposition)
    : reposition;
}

function blitzDeclarationValue(
  player: FieldPlayer,
  at: GridPosition,
  board: Board
): number {
  const carrier = board.carrier;
  const theirs = !!carrier && carrier.teamId !== board.teamId;
  return theirs && chebyshev(at, carrier.gridPosition) <= reachOf(player)
    ? 90
    : 10;
}

function scoreDeclaration(command: HeadlessCommand, board: Board): number {
  if (command.type !== "declare-action") return 0;
  const player = board.gs.getPlayerById(command.playerId);
  if (!player || !onField(player)) return 0;
  if (command.blockReplacement) return 25;
  return declarationValue(command, player, board);
}

function declarationValue(
  command: CommandOf<"declare-action">,
  player: FieldPlayer,
  board: Board
): number {
  if (command.action === "move")
    return moveDeclarationValue(player, player.gridPosition, board);
  if (command.action === "block") return bestBlockValue(player, board);
  if (command.action === "blitz")
    return blitzDeclarationValue(player, player.gridPosition, board);
  const transfer = board.carrier?.id === player.id ? 30 : 0;
  const values: Partial<Record<CommandOf<"declare-action">["action"], number>> =
    {
      pass: transfer,
      handoff: transfer,
      foul: 8,
    };
  return values[command.action] ?? 3;
}

function bestBlockValue(player: FieldPlayer, board: Board): number {
  const at = player.gridPosition;
  let best = 0;
  for (const target of board.gs.getOpponents(player.teamId)) {
    if (!target.gridPosition || target.status !== PlayerStatus.ACTIVE) continue;
    if (chebyshev(target.gridPosition, at) !== 1) continue;
    const diff = player.stats.ST - target.stats.ST;
    let value = strengthValue(diff, [60, 30, 5]);
    if (board.carrier?.id === target.id) value += 40;
    best = Math.max(best, value);
  }
  return best;
}

function squareValue(player: Player, at: GridPosition, board: Board): number {
  const carrier = board.carrier;
  if (!carrier) return board.ball ? -chebyshev(at, board.ball) * 10 : 0;
  if (carrier.id === player.id)
    return -distanceToGoal(board, player.teamId, at) * 10;
  if (carrier.teamId !== player.teamId) {
    const action = board.gs.getState().activePlayer?.action;
    return -chebyshev(at, carrier.gridPosition) * (action === "blitz" ? 12 : 6);
  }
  const goal = carrier.gridPosition;
  const ahead = {
    x: goal.x + (player.teamId === board.team1Id ? 1 : -1),
    y: goal.y,
  };
  return -chebyshev(at, ahead) * 4;
}

function moveStepValue(command: CommandOf<"move">, board: Board): number {
  const player = fieldPlayer(board, command.playerId);
  const from = player.gridPosition;
  const to = command.path.at(-1);
  if (!to) throw new RangeError("Move candidate requires a destination");
  let value = squareValue(player, to, board) - squareValue(player, from, board);
  if (tackleZonesOn(board, player.teamId, from) > 0) value -= 15;
  value -= tackleZonesOn(board, player.teamId, to) * 3;
  if (board.gs.getMovementUsed(player.id) >= player.stats.MA) value -= 20;
  const scores =
    board.carrier?.id === player.id &&
    distanceToGoal(board, player.teamId, to) === 0;
  return scores ? 1000 : value;
}

function blockStepValue(command: CommandOf<"block">, board: Board): number {
  const attacker = fieldPlayer(board, command.attackerId);
  const defender = fieldPlayer(board, command.defenderId);
  const diff = attacker.stats.ST - defender.stats.ST;
  const carrierBonus = board.carrier?.id === defender.id ? 40 : 0;
  return strengthValue(diff, [50, 20, -5]) + carrierBonus;
}

function passStepValue(
  command: CommandOf<"pass" | "handoff">,
  board: Board
): number {
  const gs = board.gs;
  const passer = fieldPlayer(board, command.playerId);
  const target =
    command.type === "handoff"
      ? fieldPlayer(board, command.targetId).gridPosition
      : { x: command.x, y: command.y };
  const gain =
    distanceToGoal(board, passer.teamId, passer.gridPosition) -
    distanceToGoal(board, passer.teamId, target);
  const receiver = [
    ...gs.getTeammates(passer.id),
    ...gs.getOpponents(passer.teamId),
  ].find(
    (p) => p.gridPosition?.x === target.x && p.gridPosition.y === target.y
  );

  const aimPenalty =
    receiver?.teamId === passer.teamId &&
    receiver.status === PlayerStatus.ACTIVE
      ? 0
      : 200;
  return (
    gain * 8 - tackleZonesOn(board, passer.teamId, target) * 10 - aimPenalty
  );
}

const STEP_TYPES = [
  "move",
  "block",
  "stab",
  "special-action",
  "pass",
  "handoff",
  "jump",
  "foul",
  "stand-up",
] as const;

function scoreStep(
  command: CommandOf<(typeof STEP_TYPES)[number]>,
  board: Board
): number {
  switch (command.type) {
    case "move":
      return moveStepValue(command, board);
    case "block":
      return blockStepValue(command, board);
    case "stab":
    case "special-action":
      return 30;
    case "pass":
    case "handoff":
      return passStepValue(command, board);
    case "jump": {
      const player = fieldPlayer(board, command.playerId);
      const to = { x: command.x, y: command.y };
      return (
        squareValue(player, to, board) -
        squareValue(player, player.gridPosition, board) -
        25
      );
    }
    case "foul":
      return 10;
    case "stand-up":
      return 15;
  }
}

function biteTargetValue(
  command: CommandOf<"choose-bite-target">,
  board: Board
): number {
  if (!command.playerId) return 0;
  const pending = board.gs.getDecisionService().pending();
  const targets = pending?.type === "bite-target" ? pending.targetIds : [];
  const order = Math.max(0, targets.indexOf(command.playerId));
  const carrier = board.carrier?.id === command.playerId;
  return (carrier ? 1 : 2 + targets.length) + (targets.length - order);
}

const BLOCK_OFFERS = [
  "choose-block-result",
  "team-reroll-block",
  "pro-reroll-block",
  "brawler-reroll-block",
  "veteran-reroll-block",
] as const;
const DECISION_TYPES = [
  "choose-push-direction",
  "choose-follow-up",
  "choose-bite-target",
  "touchback",
  "kickoff-skip",
] as const;
const OFFER_TYPES = [
  "use-reroll",
  "use-reaction",
  "use-apothecary",
  "choose-inducement",
  "choose-interception",
  "choose-foul-assists",
] as const;

function scoreDecision(command: HeadlessCommand, board: Board): number {
  if (hasCommandType(command, BLOCK_OFFERS)) return -1;
  if (hasCommandType(command, DECISION_TYPES))
    return decisionValue(command, board);
  return hasCommandType(command, OFFER_TYPES) ? scoreOffer(command) : 0;
}

function decisionValue(
  command: CommandOf<(typeof DECISION_TYPES)[number]>,
  board: Board
): number {
  switch (command.type) {
    case "choose-push-direction":
      return Math.abs(command.y - (GameConfig.PITCH_HEIGHT - 1) / 2);
    case "choose-follow-up":
      return command.followUp ? 1 : 0;
    case "choose-bite-target":
      return biteTargetValue(command, board);
    case "touchback": {
      const player = fieldPlayer(board, command.playerId);
      return -tackleZonesOn(board, player.teamId, player.gridPosition);
    }
    case "kickoff-skip":
      return 1;
  }
}

function scoreOffer(command: CommandOf<(typeof OFFER_TYPES)[number]>): number {
  switch (command.type) {
    case "use-reroll":
      return rerollOffer(command);
    case "use-reaction":
    case "use-apothecary":
      return command.accept ? 1 : 0;
    case "choose-inducement":
    case "choose-interception":
      return command.playerId ? 1 : 0;
    case "choose-foul-assists":
      return command.count;
  }
}

function rerollOffer(command: CommandOf<"use-reroll">): number {
  if (!command.accept) return 0;
  return command.source === "skill" ? 3 : 2;
}

function blockDieScore(
  candidate: Candidate,
  context: CoachContext,
  board: Board
): number | null {
  const pending = context.point.pending;
  if (pending?.type !== "block-dice") return null;
  const attacker = board.gs.getPlayerById(pending.attackerId);
  const attackerChooses = attacker?.teamId === pending.chooserTeamId;
  const best = Math.max(
    ...pending.options.map((option) => BLOCK_RANK[option.type])
  );
  const command = candidate.commands[0];
  if (command.type === "choose-block-result") {
    const option = pending.options[command.index];
    if (!option) return -1;
    const rank = BLOCK_RANK[option.type];
    return attackerChooses ? rank : 5 - rank;
  }
  if (command.type === "team-reroll-block") return best <= 1 ? 2 : -1;
  if (command.type === "veteran-reroll-block") return 3;
  return -1;
}

function readBoard(context: CoachContext): Board {
  const gs = context.game.ctx.gameService;
  const state = gs.getState();
  const ball = state.ballPosition ? { ...state.ballPosition } : null;
  const carrier = ball
    ? [...context.game.ctx.team1.players, ...context.game.ctx.team2.players]
        .filter(onField)
        .find(
          (p) =>
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

export function rankCandidates(context: CoachContext) {
  const board = readBoard(context);
  return context.point.candidates.map((candidate, index) => ({
    candidate,
    index,
    score:
      (blockDieScore(candidate, context, board) ??
        scoreCandidate(candidate, board)) +
      context.rng.next() * 0.5,
  }));
}

export const heuristicCoach: Coach = {
  name: "heuristic",
  choose(context) {
    const scores = rankCandidates(context);
    const best = scores.reduce(
      (chosen, candidate) =>
        candidate.score > chosen.score ? candidate : chosen,
      { index: 0, score: -Infinity }
    );
    return Promise.resolve({ index: best.index });
  },
};

function kickoffValue(command: HeadlessCommand): number {
  return command.type === "kick-ball" && command.y === 5
    ? 10 - Math.abs(command.x - 10) / 10
    : 5;
}

function fieldPlayer(board: Board, id: string): FieldPlayer {
  const player = board.gs.getPlayerById(id);
  if (!player || !onField(player))
    throw new RangeError(`Command references player outside the pitch: ${id}`);
  return player;
}

function hasCommandType<T extends HeadlessCommand["type"]>(
  command: HeadlessCommand,
  types: readonly T[]
): command is CommandOf<T> {
  return types.some((type) => command.type === type);
}

function strengthValue(
  difference: number,
  values: readonly [number, number, number]
): number {
  if (difference > 0) return values[0];
  return difference === 0 ? values[1] : values[2];
}
