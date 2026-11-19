import { dodgeTarget, markingPlayers, type RouteRoll } from "./rollPreview";
import { type Player } from "../../types/Player";

interface Square {
  x: number;
  y: number;
}

type MovementRisk =
  | { kind: "dodge"; dodgeNeed: number }
  | { kind: "rush"; rushNeed: number }
  | { kind: "rush-dodge"; rushNeed: number; dodgeNeed: number };

export type StepRisk =
  | MovementRisk
  | { kind: "pickup" | "secureBall"; pickupNeed: number }
  | {
      kind: "ball-step";
      movement: MovementRisk;
      pickupNeed: number;
      securing?: boolean;
    };

export function stepRolls(risk: StepRisk, square: Square): RouteRoll[] {
  switch (risk.kind) {
    case "dodge":
      return [{ type: "dodge", target: risk.dodgeNeed, square }];
    case "rush":
      return [{ type: "rush", target: risk.rushNeed, square }];
    case "rush-dodge":
      return [
        { type: "rush", target: risk.rushNeed, square },
        { type: "dodge", target: risk.dodgeNeed, square },
      ];
    case "pickup":
    case "secureBall":
      return [{ type: risk.kind, target: risk.pickupNeed, square }];
    case "ball-step":
      return [
        ...stepRolls(risk.movement, square),
        {
          type: risk.securing ? "secureBall" : "pickup",
          target: risk.pickupNeed,
          square,
        },
      ];
  }
}

export type MoveLeg =
  | { risk: null; path: [Square, ...Square[]] }
  | { risk: StepRisk; path: [Square] };

export interface LegContext {
  opponents: Player[];
  player: Player;
  ma: number;

  used: number;

  rushModifier: number;
  pickup?: { square: Square; target: number; securing?: boolean };
}

const need = (target: number) => Math.min(6, Math.max(2, target));

function movementRisk({
  rush,
  dodge,
  rushNeed,
  dodgeNeed,
}: {
  rush: boolean;
  dodge: boolean;
  rushNeed: number;
  dodgeNeed: number;
}): MovementRisk | null {
  if (rush && dodge) return { kind: "rush-dodge", rushNeed, dodgeNeed };
  if (rush) return { kind: "rush", rushNeed };
  if (dodge) return { kind: "dodge", dodgeNeed };
  return null;
}

function stepRisk(
  movement: MovementRisk | null,
  ball: { target: number; securing?: boolean } | null
): StepRisk | null {
  if (!ball) return movement;
  return movement
    ? {
        kind: "ball-step",
        movement,
        pickupNeed: ball.target,
        ...(ball.securing ? { securing: true } : {}),
      }
    : {
        kind: ball.securing ? "secureBall" : "pickup",
        pickupNeed: ball.target,
      };
}

function pickupAt(pickup: LegContext["pickup"], step: Square) {
  return pickup && pickup.square.x === step.x && pickup.square.y === step.y
    ? pickup
    : null;
}

function riskAt({
  from,
  step,
  ctx,
  index,
  pickup,
}: {
  from: Square;
  step: Square;
  ctx: LegContext;
  index: number;
  pickup: LegContext["pickup"];
}) {
  const ball = pickupAt(pickup, step);
  const movement = movementRisk({
    rush: ctx.used + index + 1 > ctx.ma,
    dodge: markingPlayers(from, ctx.opponents).length > 0,
    rushNeed: need(2 - ctx.rushModifier),
    dodgeNeed: dodgeTarget(ctx.player, from, step, ctx.opponents),
  });
  return { risk: stepRisk(movement, ball), pickedUp: ball !== null };
}

export function planMoveLegs(
  start: Square,
  path: Square[],
  ctx: LegContext
): MoveLeg[] {
  const legs: MoveLeg[] = [];
  let safe: [Square, ...Square[]] | null = null;
  let from = start;
  let pickup = ctx.pickup;
  for (const [index, step] of path.entries()) {
    const { risk, pickedUp } = riskAt({ from, step, ctx, index, pickup });
    from = step;
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
