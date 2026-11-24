import {
  dodgeTarget,
  jumpTarget,
  markingPlayers,
  type RouteRoll,
} from "./rollPreview";
import {
  JUMP_COST,
  jumpRushes,
  routeSquares,
  type RouteStep,
} from "./jump";
import { type Player } from "../../types/Player";
import { activeRules } from "../variants/activeMatch";
import type { MoveStep } from "../../headless/protocol";
import { barricadeBetween } from "./pitchSquares";
import {
  RECKLESS_CROSSING_TARGET,
  SAFE_CROSSING_EXTRA,
  crossingAt,
  planCrossings,
  stepCost,
} from "./barricades";

interface Square {
  x: number;
  y: number;
}

type StepRoll = Omit<RouteRoll, "square">;

export type StepRisk = readonly [StepRoll, ...StepRoll[]];

export function stepRolls(risk: StepRisk, square: Square): RouteRoll[] {
  return risk.map((roll) => ({ ...roll, square }));
}

export interface ClimbChoice {
  safe: StepRisk | null;
  reckless: StepRisk;
}

export type MoveLeg =
  | { risk: null; path: [MoveStep, ...MoveStep[]] }
  | { risk: StepRisk; path: [MoveStep] }
  | { risk: StepRisk | null; path: [MoveStep]; climb: ClimbChoice }
  | { risk: StepRisk; path: [RouteStep]; jump: true };

export interface LegContext {
  opponents: Player[];
  player: Player;
  ma: number;

  allowance: number;

  used: number;

  rushModifier: number;
  dodgeModifier?: number;
  pickup?: { square: Square; target: number; securing?: boolean };
}

type Pickup = LegContext["pickup"];

const need = (target: number) => Math.min(6, Math.max(2, target));

function pickupAt(pickup: Pickup, step: Square) {
  return pickup && pickup.square.x === step.x && pickup.square.y === step.y
    ? pickup
    : null;
}

interface StepAt {
  from: Square;
  step: RouteStep;
  ctx: LegContext;
  spent: number;
  pickup: Pickup;
}

const rushRoll = (ctx: LegContext): StepRoll => ({
  type: "rush",
  target: need(activeRules().rushTarget - ctx.rushModifier),
});

function pickupRolls(ball: NonNullable<Pickup> | null): StepRoll[] {
  if (!ball) return [];
  return [
    { type: ball.securing ? "secureBall" : "pickup", target: ball.target },
  ];
}

function jumpRisk({ from, step, ctx, spent, pickup }: StepAt): StepRisk {
  const { player, opponents, ma } = ctx;
  const rushes = Array.from({ length: jumpRushes(spent, ma) }, () =>
    rushRoll(ctx)
  );
  const jump: StepRoll = {
    type: "jump",
    target: jumpTarget({ player, from, to: step, opponents }),
  };
  const landing = pickupRolls(pickupAt(pickup, step));
  const [first, ...rest] = rushes;
  return first
    ? [first, ...rest, jump, ...landing]
    : [jump, ...landing];
}

function riskAt({ from, step, ctx, spent, pickup }: StepAt) {
  const ball = pickupAt(pickup, step);
  const crossing = crossingAt({ from, step, used: spent, ma: ctx.ma });
  const rolls: StepRoll[] = [];
  if (spent + 1 > ctx.ma) rolls.push(rushRoll(ctx));
  if (markingPlayers(from, ctx.opponents).length > 0)
    rolls.push({
      type: "dodge",
      target: dodgeTarget(
        ctx.player,
        { from, to: step },
        ctx.opponents,
        ctx.dodgeModifier ?? 0
      ),
    });
  if (crossing === "reckless")
    rolls.push({ type: "barricade", target: RECKLESS_CROSSING_TARGET });
  rolls.push(...pickupRolls(ball));
  const [first, ...rest] = rolls;
  return {
    risk: first ? ([first, ...rest] as const) : null,
    cost: stepCost(crossing),
  };
}

function climbChoice(
  at: StepAt,
  after: number
): ClimbChoice | null {
  const { from, step, ctx, spent } = at;
  if (!barricadeBetween(from, step)) return null;
  const climbed = spent + 1 + SAFE_CROSSING_EXTRA;
  if (climbed > ctx.ma || climbed + after > ctx.allowance) return null;
  const square = { x: step.x, y: step.y };
  const reckless = riskAt({ ...at, step: { ...square, reckless: true } }).risk;
  if (!reckless) return null;
  return { safe: riskAt({ ...at, step: square }).risk, reckless };
}

type PlannedStep = { walk: MoveStep } | { leg: MoveLeg };

function stepLeg(
  at: StepAt,
  risk: StepRisk | null,
  after: number
): PlannedStep {
  const climb = climbChoice(at, after);
  if (climb)
    return { leg: { risk, path: [{ x: at.step.x, y: at.step.y }], climb } };
  return risk ? { leg: { risk, path: [at.step] } } : { walk: at.step };
}

function planStep(
  at: StepAt,
  rest: RouteStep[]
): { planned: PlannedStep; cost: number } {
  if (at.step.over) {
    const leg: MoveLeg = { risk: jumpRisk(at), path: [at.step], jump: true };
    return { planned: { leg }, cost: JUMP_COST };
  }
  const { risk, cost } = riskAt(at);
  return { planned: stepLeg(at, risk, routeSquares(rest)), cost };
}

function plannedSteps(
  start: Square,
  path: RouteStep[],
  ctx: LegContext
): PlannedStep[] {
  const steps: PlannedStep[] = [];
  let from = start;
  let spent = ctx.used;
  let pickup = ctx.pickup;
  for (const [index, step] of planCrossings(start, path, ctx).entries()) {
    const at = { from, step, ctx, spent, pickup };
    const { planned, cost } = planStep(at, path.slice(index + 1));
    steps.push(planned);
    from = step;
    spent += cost;
    if (pickupAt(pickup, step)) pickup = undefined;
  }
  return steps;
}

export function planMoveLegs(
  start: Square,
  path: RouteStep[],
  ctx: LegContext
): MoveLeg[] {
  const legs: MoveLeg[] = [];
  let walk: [MoveStep, ...MoveStep[]] | null = null;
  for (const planned of plannedSteps(start, path, ctx)) {
    if ("walk" in planned) {
      if (walk) walk.push(planned.walk);
      else walk = [planned.walk];
      continue;
    }
    if (walk) legs.push({ risk: null, path: walk });
    walk = null;
    legs.push(planned.leg);
  }
  if (walk) legs.push({ risk: null, path: walk });
  return legs;
}
