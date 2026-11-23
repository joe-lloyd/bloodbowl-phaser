import { dodgeTarget, markingPlayers, type RouteRoll } from "./rollPreview";
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
  | { risk: StepRisk | null; path: [MoveStep]; climb: ClimbChoice };

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

const need = (target: number) => Math.min(6, Math.max(2, target));

function pickupAt(pickup: LegContext["pickup"], step: Square) {
  return pickup && pickup.square.x === step.x && pickup.square.y === step.y
    ? pickup
    : null;
}

function riskAt({
  from,
  step,
  ctx,
  spent,
  pickup,
}: {
  from: Square;
  step: MoveStep;
  ctx: LegContext;
  spent: number;
  pickup: LegContext["pickup"];
}) {
  const ball = pickupAt(pickup, step);
  const crossing = crossingAt({ from, step, used: spent, ma: ctx.ma });
  const rolls: StepRoll[] = [];
  if (spent + 1 > ctx.ma)
    rolls.push({
      type: "rush",
      target: need(activeRules().rushTarget - ctx.rushModifier),
    });
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
  if (ball)
    rolls.push({
      type: ball.securing ? "secureBall" : "pickup",
      target: ball.target,
    });
  const [first, ...rest] = rolls;
  return {
    risk: first ? ([first, ...rest] as const) : null,
    cost: stepCost(crossing),
    pickedUp: ball !== null,
  };
}

function climbChoice(
  at: Parameters<typeof riskAt>[0],
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
  at: Parameters<typeof riskAt>[0],
  risk: StepRisk | null,
  after: number
): PlannedStep {
  const climb = climbChoice(at, after);
  if (climb)
    return { leg: { risk, path: [{ x: at.step.x, y: at.step.y }], climb } };
  return risk ? { leg: { risk, path: [at.step] } } : { walk: at.step };
}

function plannedSteps(
  start: Square,
  path: Square[],
  ctx: LegContext
): PlannedStep[] {
  const steps: PlannedStep[] = [];
  let from = start;
  let spent = ctx.used;
  let pickup = ctx.pickup;
  for (const [index, step] of planCrossings(start, path, ctx).entries()) {
    const at = { from, step, ctx, spent, pickup };
    const { risk, cost, pickedUp } = riskAt(at);
    steps.push(stepLeg(at, risk, path.length - index - 1));
    from = step;
    spent += cost;
    if (pickedUp) pickup = undefined;
  }
  return steps;
}

export function planMoveLegs(
  start: Square,
  path: Square[],
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
