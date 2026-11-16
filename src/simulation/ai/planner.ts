/**
 * The computer coach, v1: a risk-ordered turn planner behind the `Coach`
 * seam. Each decision it re-reads the board, lists whole activations in
 * Bot Bowl's safe-first order and picks the candidate that carries out the
 * best one. Setup, the kick and anything it has no plan for fall back to
 * the heuristic coach.
 */

import { HeadlessCommand } from "../../headless/protocol";
import { GamePhase } from "../../types/GameState";
import { ActionType } from "../../types/events";
import { Player } from "../../types/Player";
import { rollLabel } from "../../game/rules/rollTargets";
import { Candidate } from "../candidates";
import { Coach, CoachChoice, CoachContext } from "../coach";
import { heuristicCoach } from "../coaches/heuristic";
import {
  Activation,
  Available,
  activations,
  continuation,
  continuationPlans,
  planIdentity,
} from "./activations";
import { Board, WIDTH, readBoard } from "./board";
import { decide } from "./decisions";
import { DEFAULT_WEIGHTS, Weights } from "./weights";
import { RollTarget } from "./chance";
import { enumerateLegalActions } from "../../headless/legalActions";
import type { HeadlessGame } from "../../headless/HeadlessGame";
import { context as activationContext } from "./activationContext";
import { key } from "./board";

const ROLL_NAMES: Record<RollTarget["kind"], string> = {
  dodge: "Dodge",
  rush: "Rush",
  pickup: "Pick up",
  secure: "Secure the Ball",
  catch: "Catch",
  pass: "Pass",
};

/** What the coach did and the rolls it needed, never how likely they were. */
export function noteFor(a: Activation): string {
  const what = {
    score: "runs in to score",
    carrier: "moves the ball carrier",
    pickup: "goes for the ball",
    "secure-ball": "secures the ball",
    gaze: "uses Hypnotic Gaze",
    "multiple-block": "blocks two opponents",
    handoff: "hands off",
    pass: "throws a pass",
    block: "blocks",
    blitz: "blitzes",
    reposition:
      a.intent.kind === "reposition" ? `moves to ${a.intent.role}` : "moves",
    "stand-up": "stands up",
  }[a.intent.kind];
  const rolls = a.rolls.map((r) => rollLabel(ROLL_NAMES[r.kind], r.target));
  return rolls.length ? `${what} (${rolls.join(", ")})` : what;
}

/** Which actions each player may declare, read off the declare candidates. */
export function availableActions(candidates: readonly Candidate[]): Available {
  const out = new Map<string, Set<ActionType>>();
  for (const c of candidates) {
    const command = c.commands[0];
    if (command.type !== "declare-action" || command.blockReplacement) continue;
    const set = out.get(command.playerId) ?? new Set<ActionType>();
    set.add(command.action);
    out.set(command.playerId, set);
  }
  return out;
}

/** The candidate that takes the next step of an activation already declared. */
function nextStep(a: Activation, candidates: readonly Candidate[]): number {
  const id = a.player.id;
  const match = (test: (command: HeadlessCommand) => boolean) =>
    candidates.findIndex((c) => test(c.commands[0]));
  const stepTo = (route: { path: { x: number; y: number }[] } | null) => {
    const next = route?.path[0];
    return next
      ? match(
          (c) =>
            c.type === "move" &&
            c.playerId === id &&
            c.path.length === 1 &&
            c.path[0].x === next.x &&
            c.path[0].y === next.y
        )
      : -1;
  };
  /** Walk what is left of the route first, then take the action's step. */
  const walkThen = (
    route: { path: { x: number; y: number }[] } | null,
    act: () => number
  ) => (route?.path.length ? stepTo(route) : act());
  switch (a.intent.kind) {
    case "score":
    case "carrier":
    case "pickup":
    case "secure-ball":
    case "reposition":
      return stepTo(a.intent.route);
    case "stand-up":
      return match((c) => c.type === "stand-up" && c.playerId === id);
    case "block": {
      const target = a.intent.target.id;
      return match(
        (c) =>
          c.type === "block" && c.attackerId === id && c.defenderId === target
      );
    }
    case "multiple-block": {
      const [first, second] = a.intent.targets;
      return match(
        (c) =>
          c.type === "multiple-block" &&
          c.attackerId === id &&
          ((c.defender1Id === first.id && c.defender2Id === second.id) ||
            (c.defender1Id === second.id && c.defender2Id === first.id))
      );
    }
    case "gaze": {
      const target = a.intent.target.id;
      return walkThen(a.intent.route, () =>
        match(
          (c) =>
            c.type === "special-action" &&
            c.action === "gaze" &&
            c.attackerId === id &&
            c.defenderId === target
        )
      );
    }
    case "blitz": {
      const target = a.intent.target.id;
      return walkThen(a.intent.route, () =>
        match(
          (c) =>
            c.type === "block" && c.attackerId === id && c.defenderId === target
        )
      );
    }
    case "handoff": {
      const target = a.intent.to.id;
      return walkThen(a.intent.route, () =>
        match(
          (c) =>
            c.type === "handoff" && c.playerId === id && c.targetId === target
        )
      );
    }
    case "pass": {
      const to = a.intent.to.gridPosition!;
      return walkThen(a.intent.route, () =>
        match(
          (c) =>
            c.type === "pass" &&
            c.playerId === id &&
            c.x === to.x &&
            c.y === to.y &&
            !c.hailMary
        )
      );
    }
  }
}

interface RetainedPlan {
  turn: string;
  possession: string;
  activation: Activation;
}

export interface PlannerCoach extends Coach {
  /** Prime the same continuation policy when search selects an opening plan. */
  remember(game: HeadlessGame, activation: Activation): void;
}

function turnKey(board: Board): string {
  const state = board.gs.getState();
  return `${state.turn.teamId}/${state.turn.turnNumber}/${state.turn.isHalf2}/${state.turn.extraTime}/${state.chargeTeamId}`;
}

function possessionKey(board: Board): string {
  return board.ball.kind === "carried"
    ? board.ball.carrier.id
    : board.ball.kind === "loose"
      ? `loose/${key(board.ball.at)}`
      : "none";
}

function currentIntent(
  board: Board,
  stored: RetainedPlan | undefined,
  actor: Player,
  action: string
): Activation | null {
  if (!stored) return null;
  return stored.turn === turnKey(board) &&
    stored.possession === possessionKey(board) &&
    stored.activation.player.id === actor.id &&
    stored.activation.action === action
    ? stored.activation
    : null;
}

/** A retained movement target is repriced and rerouted from the observed square. */
function retainedStep(
  board: Board,
  w: Weights,
  actor: Player,
  plan: Activation,
  candidates: readonly Candidate[],
  available: Available,
  skillPlans: boolean
): CoachChoice | null {
  const intent = plan.intent;
  if (actor.id !== plan.player.id || !actor.gridPosition) return null;
  if (
    intent.kind !== "reposition" &&
    intent.kind !== "score" &&
    intent.kind !== "carrier"
  ) {
    const resumed = continuationPlans(
      board,
      w,
      actor,
      plan.action,
      board.gs.hasUsedBlitzBlock(actor.id),
      available,
      skillPlans
    ).find((option) => planIdentity(option) === planIdentity(plan));
    const index = resumed ? nextStep(resumed, candidates) : -1;
    return index < 0 || !resumed ? null : { index, note: noteFor(resumed) };
  }
  if (key(actor.gridPosition) === key(intent.route.to)) {
    const end = candidates.findIndex((c) => c.kind === "end-activation");
    return end < 0 ? null : { index: end, note: noteFor(plan) };
  }
  const c = activationContext(board, w, available, skillPlans);
  const route = c.routes(actor).get(key(intent.route.to));
  if (!route || route.chance + 1e-9 < intent.route.chance) return null;
  const resumed: Activation = {
    ...plan,
    player: actor,
    intent: { ...intent, route },
    rolls: route.rolls,
  };
  const index = nextStep(resumed, candidates);
  return index < 0 ? null : { index, note: noteFor(resumed) };
}

export function createPlannerCoach(
  options: { weights?: Weights; name?: string; skillPlans?: boolean } = {}
): PlannerCoach {
  const w = options.weights ?? DEFAULT_WEIGHTS;
  const memory = new WeakMap<HeadlessGame, RetainedPlan>();
  const remember = (game: HeadlessGame, activation: Activation) => {
    const board = readBoard(game, activation.player.teamId);
    memory.set(game, {
      turn: turnKey(board),
      possession: possessionKey(board),
      activation,
    });
  };
  return {
    name: options.name ?? "planner",
    remember,
    async choose(context: CoachContext): Promise<CoachChoice> {
      return (
        planChoice(context, w, options.skillPlans ?? true, memory, remember) ??
        heuristicCoach.choose(context)
      );
    },
  };
}

function setupChoice(
  candidates: readonly Candidate[],
  w: Weights
): CoachChoice | null {
  const formations = candidates.filter((c) => c.kind === "setup");
  if (formations.length < 2) return null;
  const pick =
    formations[
      Math.max(0, Math.min(Math.round(w.formation), formations.length - 1))
    ];
  return { index: candidates.indexOf(pick) };
}

/** The kick nearest the tuned depth, in the middle or on the emptier side. */
function kickChoice(
  board: Board,
  candidates: readonly Candidate[],
  w: Weights
): CoachChoice | null {
  const kicks = candidates.flatMap((c, index) => {
    const command = c.commands[0];
    return command.type === "kick-ball"
      ? [{ index, x: command.x, y: command.y }]
      : [];
  });
  if (kicks.length === 0) return null;
  const crowd = (y: number) =>
    board.theirs.filter((o) => Math.abs(o.gridPosition!.y - y) <= 2).length;
  const wide = w.kickWide > 0.5;
  const score = (kick: { x: number; y: number }) => {
    const depth = board.dir === 1 ? WIDTH - 1 - kick.x : kick.x;
    return (
      -Math.abs(depth - w.kickDepth) * 10 +
      (wide ? (kick.y === 5 ? -5 : -crowd(kick.y)) : kick.y === 5 ? 5 : 0)
    );
  };
  const best = kicks.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { index: best.index };
}

function planChoice(
  context: CoachContext,
  w: Weights,
  skillPlans: boolean,
  memory: WeakMap<HeadlessGame, RetainedPlan>,
  remember: (game: HeadlessGame, activation: Activation) => void
): CoachChoice | null {
  const { game, point } = context;
  const candidates = point.candidates;
  const board = readBoard(game, point.teamId);

  if (point.pending) {
    const index = decide(board, point.pending, candidates, skillPlans);
    return index === null ? null : { index };
  }
  if (point.phase === GamePhase.SETUP) return setupChoice(candidates, w);
  if (point.phase === GamePhase.KICKOFF)
    return kickChoice(board, candidates, w);
  if (point.phase !== GamePhase.PLAY) return null;

  const state = board.gs.getState();
  const active = state.activePlayer;
  const actor = active ? board.gs.getPlayerById(active.id) : undefined;
  if (active && actor && actor.teamId === point.teamId && active.action) {
    const waiting: Available = new Map(
      enumerateLegalActions({ ctx: game.ctx, pending: null })
        .players.filter((p) => p.playerId !== actor.id)
        .map((p) => [p.playerId, new Set(p.actions)])
    );
    const stored = currentIntent(board, memory.get(game), actor, active.action);
    if (stored) {
      const choice = retainedStep(
        board,
        w,
        actor,
        stored,
        candidates,
        waiting,
        skillPlans
      );
      if (choice) return choice;
      memory.delete(game);
    }
    return continueChoice(
      board,
      w,
      candidates,
      actor,
      active.action,
      skillPlans,
      waiting
    );
  }
  memory.delete(game);
  return declareChoice(board, w, candidates, skillPlans, (activation) =>
    remember(game, activation)
  );
}

/** The next step of the activation under way, or ending it. */
function continueChoice(
  board: Board,
  w: Weights,
  candidates: readonly Candidate[],
  actor: Player,
  action: string,
  skillPlans: boolean,
  available?: Available
): CoachChoice | null {
  // Team-mates who have not acted yet still count as helpers, for the
  // cage the carrier is walking into and the receiver it hands off to.
  const acted = new Set(board.gs.getState().turn.activatedPlayerIds ?? []);
  const waiting: Available =
    available ??
    new Map(
      board.ours
        .filter((p) => p.id !== actor.id && !acted.has(p.id))
        .map((p) => [p.id, new Set<ActionType>(["move"])])
    );
  const plan = continuation(
    board,
    w,
    actor,
    action as ActionType,
    board.gs.hasUsedBlitzBlock(actor.id),
    waiting,
    skillPlans
  );
  const index = plan ? nextStep(plan, candidates) : -1;
  if (plan && index >= 0) return { index, note: noteFor(plan) };
  const end = candidates.findIndex((c) => c.kind === "end-activation");
  return end >= 0 ? { index: end } : null;
}

/** Declare the first planned activation on offer, else end the turn. */
function declareChoice(
  board: Board,
  w: Weights,
  candidates: readonly Candidate[],
  skillPlans: boolean,
  selected: (activation: Activation) => void
): CoachChoice | null {
  const plan = activations(board, w, availableActions(candidates), skillPlans);
  for (const a of plan) {
    const index = candidates.findIndex((c) => {
      const command = c.commands[0];
      return (
        command.type === "declare-action" &&
        !command.blockReplacement &&
        command.playerId === a.player.id &&
        command.action === a.action
      );
    });
    if (index >= 0) {
      selected(a);
      return { index, note: noteFor(a) };
    }
  }
  const end = candidates.findIndex((c) => c.kind === "end-turn");
  return end >= 0 ? { index: end } : null;
}

export const plannerCoach = createPlannerCoach();
