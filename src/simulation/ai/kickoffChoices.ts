import { isPickableKickoffPlayer } from "../../game/kickoff/kickoffEvents";
import {
  type KickoffTurn,
  kickoffTurnPlay,
} from "../../game/kickoff/kickoffTurn";
import type { HeadlessGame } from "../../headless/HeadlessGame";
import type { PendingDecision } from "../../headless/protocol";
import type { ActionType } from "../../types/events";
import type { Candidate } from "../candidates";
import type { CoachChoice } from "../coach";
import type { Activation, Available } from "./activations";
import {
  type Board,
  type FieldPlayer as Player,
  distance,
  key,
  middleRow,
  readBoard,
  toGoal,
} from "./board";
import { bestBy } from "../../game/core/order";
import {
  type KickoffGround,
  catchChance,
  kickoffGround,
  teamSquares,
} from "./kickoffGround";
import { playerPlans, teamPlans } from "./kickoffPlans";
import {
  type KickoffStep,
  bestKickoffStep,
  freeNeighbours,
  stepIndex,
} from "./kickoffSteps";
import type { Weights } from "./weights";

type KickoffPending = Extract<PendingDecision, { type: "kickoff-event" }>;

const UNDER_THE_BALL = "waits under the ball";

interface Pick {
  player: Player;
  what: string;
}

interface PickArgs {
  game: HeadlessGame;
  teamId: string;
  w: Weights;
  pending: KickoffPending;
}

function kickoffNote(ground: KickoffGround, { intent }: Activation): string {
  if (intent.kind === "blitz") return "blitzes";
  if (intent.kind === "block") return "blocks";
  if (intent.kind !== "reposition") return "moves";
  if (intent.role === "mark") return "marks a likely receiver";
  const { landing } = ground;
  return landing && key(intent.route.to) === key(landing)
    ? "gets under the ball"
    : "closes on the ball";
}

function highKickPick(ground: KickoffGround, able: readonly Player[]): Pick[] {
  const { landing } = ground;
  if (!landing) return [];
  const away = (p: Player) => distance(p.gridPosition, landing);
  const rated = able
    .map((player) => ({
      player,
      chance: catchChance(ground, player, landing),
    }))
    .filter(({ chance }) => chance > 0)
    .sort((a, b) => b.chance - a.chance || away(a.player) - away(b.player));
  return rated
    .slice(0, 1)
    .map(({ player }) => ({ player, what: UNDER_THE_BALL }));
}

function bestSteps(
  ground: KickoffGround,
  able: readonly Player[],
  limit: number
): KickoffStep[] {
  const chosen: KickoffStep[] = [];
  while (chosen.length < limit) {
    const [best] = able
      .filter(({ id }) => chosen.every(({ player }) => player.id !== id))
      .flatMap((player) => {
        const open = freeNeighbours(ground, player).filter(
          (s) => chosen.every(({ at }) => key(at) !== key(s))
        );
        return bestKickoffStep(ground, player, open) ?? [];
      })
      .sort((a, b) => b.value - a.value);
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

function wantedPicks({ game, teamId, w, pending }: PickArgs): Pick[] {
  const { event, selectionLimit } = pending;
  const { ours, theirs } = readBoard(game, teamId);
  const able = ours.filter((p) => isPickableKickoffPlayer(event, p, theirs));
  const play = kickoffTurnPlay(event);
  const actions = new Set<ActionType>(
    play?.kind === "actions" ? play.actions : []
  );
  const available: Available = new Map(able.map((p) => [p.id, actions]));
  const ground = kickoffGround({
    game,
    teamId,
    w,
    available,
    limit: selectionLimit,
  });
  if (!play) return highKickPick(ground, able);
  if (play.kind === "one-square")
    return bestSteps(ground, able, selectionLimit);
  return teamPlans(ground, selectionLimit).map((plan) => ({
    player: plan.player,
    what: kickoffNote(ground, plan),
  }));
}

export function kickoffPick(
  args: PickArgs,
  candidates: readonly Candidate[]
): CoachChoice {
  const { event, selectedPlayerIds } = args.pending;
  const placing = candidates.findIndex(
    (candidate) => candidate.commands[0].type === "kickoff-place-player"
  );
  if (placing !== -1)
    return { index: placing, note: `${event}: ${UNDER_THE_BALL}` };
  const wanted = wantedPicks(args);
  const next = wanted.find(
    ({ player }) => !selectedPlayerIds.includes(player.id)
  );
  const selecting = candidates.findIndex(
    (candidate) => {
      const command = candidate.commands[0];
      return command.type === "kickoff-select-player" && command.playerId === next?.player.id;
    }
  );
  if (next && selecting !== -1)
    return {
      index: selecting,
      note: `${event}: ${next.what}`,
    };
  const type = wanted.length > 0 ? "kickoff-confirm" : "kickoff-skip";
  return {
    index: Math.max(
      0,
      candidates.findIndex((candidate) => candidate.commands[0].type === type)
    ),
  };
}

export type KickoffMove =
  | { kind: "plan"; plan: Activation; note: string }
  | { kind: "choice"; choice: CoachChoice }
  | { kind: "done" };

interface TurnArgs {
  game: HeadlessGame;
  teamId: string;
  w: Weights;
  turn: KickoffTurn;
  candidates: readonly Candidate[];
  available: Available;
}

function nextStep(args: TurnArgs): KickoffMove {
  const { game, turn, candidates } = args;
  const ground = kickoffGround(args);
  const { activatedPlayerIds } = game.ctx.gameService.getState().turn;
  const waiting = ground.c.board.ours.filter(
    ({ id }) => turn.playerIds.includes(id) && !activatedPlayerIds.has(id)
  );
  const [step] = bestSteps(ground, waiting, 1);
  const index = step ? stepIndex(candidates, step) : -1;
  if (!step || index < 0) return { kind: "done" };
  const note = `${turn.event}: ${step.what}`;
  return { kind: "choice", choice: { index, note } };
}

function actorPlan(ground: KickoffGround, args: TurnArgs): Activation | null {
  const { game } = args;
  const gs = game.ctx.gameService;
  const active = gs.getState().activePlayer;
  const actor = ground.c.board.ours.find(({ id }) => id === active?.id);
  if (!actor || !active?.action) return null;
  const struck = gs.hasUsedBlitzBlock(actor.id);
  const actions = new Set<ActionType>(struck ? [] : [active.action]);
  if (struck) actions.add("move");
  const [plan] = playerPlans({
    ground,
    player: actor,
    actions,
    squares: teamSquares(ground),
  });
  return plan ?? null;
}

export function kickoffMove(args: TurnArgs): KickoffMove {
  const { game, turn } = args;
  if (turn.play.kind === "one-square") return nextStep(args);
  const ground = kickoffGround({ ...args, limit: turn.selectionLimit });
  const plan = game.ctx.gameService.getState().activePlayer?.action
    ? actorPlan(ground, args)
    : teamPlans(ground, turn.selectionLimit)[0];
  if (!plan) return { kind: "done" };
  return {
    kind: "plan",
    plan,
    note: `${turn.event}: ${kickoffNote(ground, plan)}`,
  };
}

export function kickChoice(
  board: Board,
  candidates: readonly Candidate[],
  w: Weights
): CoachChoice | null {
  const kicks = candidates.flatMap((c, index) => {
    const command = c.commands[0];
    return command.type === "kick-ball"
      ? { index, x: command.x, y: command.y }
      : [];
  });
  if (kicks.length === 0) return null;
  const crowd = (y: number) =>
    board.theirs.filter((o) => Math.abs(o.gridPosition.y - y) <= 2).length;
  const wide = w.kickWide > 0.5;
  const score = (kick: { x: number; y: number }) => {
    const depth = toGoal(board, kick);
    return -Math.abs(depth - w.kickDepth) * 10 + kickWidth(kick.y, wide, crowd);
  };
  const best = bestBy(kicks, score);
  if (!best) throw new Error("No kick to choose from");
  return { index: best.index };
}

function kickWidth(
  y: number,
  wide: boolean,
  crowd: (y: number) => number
): number {
  const middle = y === middleRow();
  if (wide) return middle ? -5 : -crowd(y);
  return middle ? 5 : 0;
}
