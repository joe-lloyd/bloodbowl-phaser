import { dodgeTarget, markingPlayers, type RouteRoll } from "./rollPreview";
import { type Player } from "../../types/Player";
import { activeRules } from "../variants/activeMatch";
import type { MoveStep } from "../../headless/protocol";
import {
  RECKLESS_CROSSING_TARGET,
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

export type MoveLeg =
  | { risk: null; path: [MoveStep, ...MoveStep[]] }
  | { risk: StepRisk; path: [MoveStep] };

export interface LegContext {
  opponents: Player[];
  player: Player;
  ma: number;

  used: number;

  rushModifier: number;
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
      target: dodgeTarget(ctx.player, from, step, ctx.opponents),
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

export function planMoveLegs(
  start: Square,
  path: Square[],
  ctx: LegContext
): MoveLeg[] {
  const legs: MoveLeg[] = [];
  let safe: [MoveStep, ...MoveStep[]] | null = null;
  let from = start;
  let spent = ctx.used;
  let pickup = ctx.pickup;
  for (const step of planCrossings(start, path, ctx)) {
    const { risk, cost, pickedUp } = riskAt({ from, step, ctx, spent, pickup });
    from = step;
    spent += cost;
    if (pickedUp) pickup = undefined;
    if (!risk) {
      if (safe) safe.push(step);
      else safe = [step];
      continue;
    }
    if (safe) legs.push({ risk: null, path: safe });
    safe = null;
    legs.push({ risk, path: [step] });
  }
  if (safe) legs.push({ risk: null, path: safe });
  return legs;
}
