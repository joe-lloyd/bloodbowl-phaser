import { type FieldPlayer as Player } from "./board";
import { type HeadlessCommand } from "../../headless/protocol";
import { GamePhase } from "../../types/GameState";
import { PlayerStatus } from "../../types/Player";
import { type ActionType } from "../../types/events";

import { rollLabel } from "../../game/rules/rollTargets";
import { type Candidate } from "../candidates";
import { type Coach, type CoachChoice, type CoachContext } from "../coach";
import { heuristicCoach } from "../coaches/heuristic";
import {
  type Activation,
  type Intent,
  type Available,
  activations,
  continuation,
  continuationPlans,
  planIdentity,
} from "./activations";
import { type Board, type Square, pitchWidth, readBoard } from "./board";
import { decide } from "./decisions";
import {
  DEFAULT_WEIGHTS,
  ROSTER_WEIGHTS,
  type RosterWeights,
  type Weights,
} from "./weights";
import { type RollTarget } from "./chance";
import { enumerateLegalActions } from "../../headless/legalActions";
import type { HeadlessGame } from "../../headless/HeadlessGame";
import { context as activationContext } from "./activationContext";
import { key } from "./board";
import {
  GAME_PLANS,
  type GamePlan,
  type Variety,
  choosePlan,
} from "./gamePlans";
import type { CoachRng } from "../rng";

const THROW_TEAMMATE = "throw-teammate";

const ROLL_NAMES: Record<RollTarget["kind"], string> = {
  dodge: "Dodge",
  rush: "Rush",
  barricade: "Reckless crossing",
  pickup: "Pick up",
  secure: "Secure the Ball",
  catch: "Catch",
  pass: "Pass",
  throw: "Throw Team-mate",
  landing: "Landing",
};

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
    [THROW_TEAMMATE]:
      a.intent.kind === THROW_TEAMMATE && a.intent.carrying
        ? "throws the ball carrier"
        : "throws a team-mate",
    block: "blocks",
    foul: "fouls",
    blitz: "blitzes",
    reposition:
      a.intent.kind === "reposition" ? `moves to ${a.intent.role}` : "moves",
    "stand-up": "stands up",
  }[a.intent.kind];
  const rolls = a.rolls.map((r) => rollLabel(ROLL_NAMES[r.kind], r.target));
  return rolls.length ? `${what} (${rolls.join(", ")})` : what;
}

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

function commandIndex(
  candidates: readonly Candidate[],
  match: (command: HeadlessCommand) => boolean
): number {
  return candidates.findIndex((candidate) => match(candidate.commands[0]));
}

function nextStep(a: Activation, candidates: readonly Candidate[]): number {
  const { player, intent } = a;
  const next = "route" in intent ? intent.route?.path[0] : undefined;
  if (next) return movementStep(candidates, player.id, next);
  if ("target" in intent) {
    const up = standUpFirst(candidates, player);
    return up >= 0 ? up : targetedStep(candidates, player.id, intent);
  }
  if ("to" in intent) return transferStep(candidates, player.id, intent);
  if ("targets" in intent)
    return multipleBlockStep(candidates, player.id, intent.targets);
  if ("mate" in intent) return thrownStep(candidates, player.id, intent);
  return intent.kind === "stand-up"
    ? commandIndex(
        candidates,
        (c) => c.type === "stand-up" && c.playerId === player.id
      )
    : -1;
}

function standUpFirst(
  candidates: readonly Candidate[],
  player: Player
): number {
  if (player.status !== PlayerStatus.PRONE) return -1;
  return commandIndex(
    candidates,
    (c) => c.type === "stand-up" && c.playerId === player.id
  );
}

function movementStep(
  candidates: readonly Candidate[],
  id: string,
  next: Square
): number {
  return commandIndex(
    candidates,
    (c) =>
      c.type === "move" &&
      c.playerId === id &&
      c.path.length === 1 &&
      c.path[0]?.x === next.x &&
      c.path[0].y === next.y
  );
}

type TargetIntent = Extract<Intent, { target: Player }>;

function targetedStep(
  candidates: readonly Candidate[],
  id: string,
  intent: TargetIntent
): number {
  const target = intent.target;
  const block = (c: HeadlessCommand) =>
    c.type === "block" && c.attackerId === id && c.defenderId === target.id;
  const matches = {
    block,
    blitz: block,
    gaze: (c: HeadlessCommand) =>
      c.type === "special-action" &&
      c.action === "gaze" &&
      c.attackerId === id &&
      c.defenderId === target.id,
    foul: (c: HeadlessCommand) =>
      c.type === "foul" &&
      c.playerId === id &&
      c.x === target.gridPosition.x &&
      c.y === target.gridPosition.y,
  };
  return commandIndex(candidates, matches[intent.kind]);
}

function transferStep(
  candidates: readonly Candidate[],
  id: string,
  intent: Extract<Intent, { to: Player }>
): number {
  if (intent.kind === "handoff")
    return commandIndex(
      candidates,
      (c) =>
        c.type === "handoff" && c.playerId === id && c.targetId === intent.to.id
    );
  return commandIndex(
    candidates,
    (c) =>
      c.type === "pass" &&
      c.playerId === id &&
      c.x === intent.to.gridPosition.x &&
      c.y === intent.to.gridPosition.y &&
      !c.hailMary
  );
}

function multipleBlockStep(
  candidates: readonly Candidate[],
  id: string,
  targets: [Player, Player]
): number {
  const [first, second] = targets;
  return commandIndex(
    candidates,
    (c) =>
      c.type === "multiple-block" &&
      c.attackerId === id &&
      ((c.defender1Id === first.id && c.defender2Id === second.id) ||
        (c.defender1Id === second.id && c.defender2Id === first.id))
  );
}

function thrownStep(
  candidates: readonly Candidate[],
  id: string,
  intent: Extract<Intent, { kind: typeof THROW_TEAMMATE }>
): number {
  return commandIndex(
    candidates,
    (c) =>
      c.type === THROW_TEAMMATE &&
      c.throwerId === id &&
      c.teammateId === intent.mate.id &&
      c.x === intent.aim.x &&
      c.y === intent.aim.y &&
      !c.swoopFacing
  );
}

interface RetainedPlan {
  turn: string;
  possession: string;
  activation: Activation;
}

export interface PlannerCoach extends Coach {
  remember(game: HeadlessGame, activation: Activation): void;
}

function turnKey(board: Board): string {
  const state = board.gs.getState();
  return `${state.turn.teamId}/${String(state.turn.turnNumber)}/${String(state.turn.isHalf2)}/${String(state.turn.extraTime)}/${String(state.chargeTeamId)}`;
}

function possessionKey(board: Board): string {
  if (board.ball.kind === "carried") return board.ball.carrier.id;
  return board.ball.kind === "loose"
    ? `loose/${String(key(board.ball.at))}`
    : "none";
}

interface CurrentIntentArgs {
  board: Board;
  stored: RetainedPlan | undefined;
  actor: Player;
  action: ActionType;
}

function currentIntent({
  board,
  stored,
  actor,
  action,
}: CurrentIntentArgs): Activation | null {
  if (!stored) return null;
  return stored.turn === turnKey(board) &&
    stored.possession === possessionKey(board) &&
    stored.activation.player.id === actor.id &&
    stored.activation.action === action
    ? stored.activation
    : null;
}

interface RetainedStepArgs {
  board: Board;
  w: Weights;
  actor: Player;
  plan: Activation;
  candidates: readonly Candidate[];
  available: Available;
  skillPlans: boolean;
}

function retainedStep({
  board,
  w,
  actor,
  plan,
  candidates,
  available,
  skillPlans,
}: RetainedStepArgs): CoachChoice | null {
  const intent = plan.intent;
  if (actor.id !== plan.player.id) return null;
  if (!isTravelIntent(intent)) {
    return resumeAction({
      board,
      w,
      actor,
      plan,
      candidates,
      available,
      skillPlans,
    });
  }
  if (key(actor.gridPosition) === key(intent.route.to)) {
    const end = candidates.findIndex((c) => c.kind === "end-activation");
    return end < 0 ? null : { index: end, note: noteFor(plan) };
  }
  const c = activationContext({
    board: board,
    w: w,
    available: available,
    skillPlans: skillPlans,
  });
  const routes =
    intent.kind === "reposition" ? c.plainRoutes(actor) : c.routes(actor);
  const route = routes.get(key(intent.route.to));
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

interface Choosing {
  plan: GamePlan;
  variety: Variety;
  rng: CoachRng;
}

interface CreatePlannerCoachArgs {
  weights?: Weights;

  rosters?: RosterWeights;
  name?: string;
  skillPlans?: boolean;

  variety?: Variety;
}

export function createPlannerCoach(
  options: CreatePlannerCoachArgs = {}
): PlannerCoach {
  const w = options.weights ?? DEFAULT_WEIGHTS;
  const memory = new WeakMap<HeadlessGame, RetainedPlan>();
  const plans = new WeakMap<HeadlessGame, GamePlan>();
  const choosing = (context: CoachContext): Choosing | null => {
    const variety = options.variety;
    if (!variety) return null;
    let plan = plans.get(context.game);
    if (!plan) plans.set(context.game, (plan = context.rng.pick(GAME_PLANS)));
    return { plan, variety, rng: context.rng };
  };
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
      const chosen = choosing(context);
      const { team1, team2 } = context.game.ctx;
      const team = team1.id === context.point.teamId ? team1 : team2;
      const own = (options.rosters ?? ROSTER_WEIGHTS)[team.rosterName];
      const weights =
        own || chosen?.plan.weights
          ? { ...w, ...own, ...chosen?.plan.weights }
          : w;
      return (
        planChoice({
          context: context,
          w: weights,
          skillPlans: options.skillPlans ?? true,
          memory: memory,
          remember: remember,
          choosing: () => chosen,
        }) ?? heuristicCoach.choose(context)
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
  return pick ? { index: candidates.indexOf(pick) } : null;
}

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
    board.theirs.filter((o) => Math.abs(o.gridPosition.y - y) <= 2).length;
  const wide = w.kickWide > 0.5;
  const score = (kick: { x: number; y: number }) => {
    const depth = board.dir === 1 ? pitchWidth() - 1 - kick.x : kick.x;
    return -Math.abs(depth - w.kickDepth) * 10 + kickWidth(kick.y, wide, crowd);
  };
  const best = kicks.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { index: best.index };
}

interface PlanChoiceArgs {
  context: CoachContext;
  w: Weights;
  skillPlans: boolean;
  memory: WeakMap<HeadlessGame, RetainedPlan>;
  remember: (game: HeadlessGame, activation: Activation) => void;
  choosing: (context: CoachContext) => Choosing | null;
}

function planChoice({
  context,
  w,
  skillPlans,
  memory,
  remember,
  choosing,
}: PlanChoiceArgs): CoachChoice | null {
  const { game, point } = context;
  const candidates = point.candidates;
  const board = readBoard(game, point.teamId);

  if (point.pending) {
    const index = decide({
      board: board,
      pending: point.pending,
      candidates: candidates,
      skillPlans: skillPlans,
    });
    return index === null ? null : { index };
  }
  if (point.phase === GamePhase.SETUP) return setupChoice(candidates, w);
  if (point.phase === GamePhase.KICKOFF)
    return kickChoice(board, candidates, w);
  if (point.phase !== GamePhase.PLAY) return null;

  const state = board.gs.getState();
  const active = state.activePlayer;
  const actor = board.ours.find((player) => player.id === active?.id);
  if (actor?.teamId === point.teamId && active?.action) {
    return activeChoice({
      context,
      w,
      skillPlans,
      memory,
      remember,
      choosing,
      board,
      actor,
      action: active.action,
    });
  }
  memory.delete(game);
  return declareChoice({
    board: board,
    w: w,
    candidates: candidates,
    skillPlans: skillPlans,
    selected: (activation) => {
      remember(game, activation);
    },
    choosing: choosing(context),
  });
}

interface ContinueChoiceArgs {
  board: Board;
  w: Weights;
  candidates: readonly Candidate[];
  actor: Player;
  action: ActionType;
  skillPlans: boolean;
  available?: Available;
}

function continueChoice({
  board,
  w,
  candidates,
  actor,
  action,
  skillPlans,
  available,
}: ContinueChoiceArgs): CoachChoice | null {
  const acted = new Set(board.gs.getState().turn.activatedPlayerIds);
  const waiting: Available =
    available ??
    new Map(
      board.ours
        .filter((p) => p.id !== actor.id && !acted.has(p.id))
        .map((p) => [p.id, new Set<ActionType>(["move"])])
    );
  const plan = continuation({
    board,
    w,
    player: actor,
    action,
    blitzBlockUsed: board.gs.hasUsedBlitzBlock(actor.id),
    available: waiting,
    skillPlans,
  });
  const index = plan ? nextStep(plan, candidates) : -1;
  if (plan && index >= 0) return { index, note: noteFor(plan) };
  const end = candidates.findIndex((c) => c.kind === "end-activation");
  return end >= 0 ? { index: end } : null;
}

interface DeclareChoiceArgs {
  board: Board;
  w: Weights;
  candidates: readonly Candidate[];
  skillPlans: boolean;
  selected: (activation: Activation) => void;
  choosing: Choosing | null;
}

function declareChoice({
  board,
  w,
  candidates,
  skillPlans,
  selected,
  choosing,
}: DeclareChoiceArgs): CoachChoice | null {
  const plan = activations({
    board: board,
    w: w,
    available: availableActions(candidates),
    skillPlans: skillPlans,
  });
  const options: { activation: Activation; index: number }[] = [];
  for (const activation of plan) {
    const index = declarationIndex(candidates, activation);
    if (index < 0) continue;
    options.push({ activation, index });
    if (!choosing) break;
  }
  if (options.length === 0) {
    const end = candidates.findIndex((c) => c.kind === "end-turn");
    return end >= 0 ? { index: end } : null;
  }
  const pick = choosing
    ? choosePlan({
        options: options,
        plan: choosing.plan,
        variety: choosing.variety,
        rng: choosing.rng,
      })
    : options[0];
  if (!pick) return null;
  selected(pick.activation);
  return { index: pick.index, note: noteFor(pick.activation) };
}

export const plannerCoach = createPlannerCoach();

function resumeAction({
  board,
  w,
  actor,
  plan,
  candidates,
  available,
  skillPlans,
}: RetainedStepArgs): CoachChoice | null {
  const resumed = continuationPlans({
    board: board,
    w: w,
    player: actor,
    action: plan.action,
    blitzBlockUsed: board.gs.hasUsedBlitzBlock(actor.id),
    available: available,
    skillPlans: skillPlans,
  }).find((option) => planIdentity(option) === planIdentity(plan));
  const index = resumed ? nextStep(resumed, candidates) : -1;
  return index < 0 || !resumed ? null : { index, note: noteFor(resumed) };
}

function kickWidth(
  y: number,
  wide: boolean,
  crowd: (y: number) => number
): number {
  if (wide) return y === 5 ? -5 : -crowd(y);
  return y === 5 ? 5 : 0;
}

interface ActiveChoiceArgs extends PlanChoiceArgs {
  board: Board;
  actor: Player;
  action: ActionType;
}

function activeChoice({
  context: { game, point },
  w,
  skillPlans,
  memory,
  board,
  actor,
  action,
}: ActiveChoiceArgs): CoachChoice | null {
  const candidates = point.candidates;
  const waiting: Available = new Map(
    enumerateLegalActions({ ctx: game.ctx, pending: null })
      .players.filter((p) => p.playerId !== actor.id)
      .map((p) => [p.playerId, new Set(p.actions)])
  );
  const stored = currentIntent({
    board: board,
    stored: memory.get(game),
    actor: actor,
    action: action,
  });
  if (stored) {
    const choice = retainedStep({
      board: board,
      w: w,
      actor: actor,
      plan: stored,
      candidates: candidates,
      available: waiting,
      skillPlans: skillPlans,
    });
    if (choice) return choice;
    memory.delete(game);
  }
  return continueChoice({
    board: board,
    w: w,
    candidates: candidates,
    actor: actor,
    action: action,
    skillPlans: skillPlans,
    available: waiting,
  });
}

function isTravelIntent(
  intent: Intent
): intent is Extract<Intent, { kind: "reposition" | "score" | "carrier" }> {
  return (
    intent.kind === "reposition" ||
    intent.kind === "score" ||
    intent.kind === "carrier"
  );
}

export function declarationIndex(
  candidates: readonly Candidate[],
  activation: Activation
): number {
  return candidates.findIndex((candidate) => {
    const command = candidate.commands[0];
    return (
      command.type === "declare-action" &&
      !command.blockReplacement &&
      command.playerId === activation.player.id &&
      command.action === activation.action
    );
  });
}
