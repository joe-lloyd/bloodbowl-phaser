import { Player, hasTackleZone } from "../../types/Player";

type Square = { x: number; y: number };

/** The roll a step needs, as the number the coach must reach on a D6. */
export type StepRisk =
  | { kind: "dodge"; dodgeNeed: number }
  | { kind: "rush"; rushNeed: number }
  /** Both: the Rush is rolled first (rulebook p.62). */
  | { kind: "rush-dodge"; rushNeed: number; dodgeNeed: number };

/**
 * One piece of a planned route. A risky leg is a single step whose roll the
 * coach confirms first; a safe leg is a run of steps that roll nothing.
 */
export type MoveLeg =
  | { risk: null; path: Square[] }
  | { risk: StepRisk; path: [Square] };

export interface LegContext {
  /** Opponents on the pitch; only those with a Tackle Zone mark squares. */
  opponents: Player[];
  ag: number;
  ma: number;
  /** Squares already spent this activation, stand-up cost included. */
  used: number;
  /** Weather and inducement modifier on Rush rolls (0 normally). */
  rushModifier: number;
}

const marking = (square: Square, opponents: Player[]) =>
  opponents.filter(
    (o) =>
      o.gridPosition &&
      hasTackleZone(o) &&
      Math.max(
        Math.abs(o.gridPosition.x - square.x),
        Math.abs(o.gridPosition.y - square.y)
      ) === 1
  ).length;

/** A natural 1 always fails and a natural 6 always passes. */
const need = (target: number) => Math.min(6, Math.max(2, target));

/**
 * Split a route into legs at every step that needs a roll, so the board can
 * walk the safe part, stop, and ask before each Dodge or Rush.
 */
export function planMoveLegs(
  start: Square,
  path: Square[],
  ctx: LegContext
): MoveLeg[] {
  const legs: MoveLeg[] = [];
  let safe: Square[] = [];
  let from = start;
  path.forEach((step, i) => {
    const rush = ctx.used + i + 1 > ctx.ma;
    const dodge = marking(from, ctx.opponents) > 0;
    from = step;
    if (!rush && !dodge) {
      safe.push(step);
      return;
    }
    if (safe.length) legs.push({ risk: null, path: safe });
    safe = [];
    const rushNeed = need(2 - ctx.rushModifier);
    const dodgeNeed = need(ctx.ag + marking(step, ctx.opponents));
    const risk: StepRisk =
      rush && dodge
        ? { kind: "rush-dodge", rushNeed, dodgeNeed }
        : rush
          ? { kind: "rush", rushNeed }
          : { kind: "dodge", dodgeNeed };
    legs.push({ risk, path: [step] });
  });
  if (safe.length) legs.push({ risk: null, path: safe });
  return legs;
}
