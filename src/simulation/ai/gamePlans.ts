/**
 * How a coach varies its play. Each match it draws a game plan that leans
 * towards some kinds of activation, and each declaration it may take any
 * plan within `margin` points of the best rather than the best alone, so a
 * human who plays it every week cannot read its next move. The planner's
 * valuations stay as they are: a game plan only re-ranks close options.
 */

import type { CoachRng } from "../rng";
import type { Activation } from "./activations";
import type { Weights } from "./weights";

/** What a game plan leans towards: an intent kind, or a positioning role. */
type Lean =
  | Exclude<Activation["intent"]["kind"], "reposition">
  | `reposition:${Extract<Activation["intent"], { kind: "reposition" }>["role"]}`;

export interface GamePlan {
  name: string;
  /** Points added to a plan's value when choosing between close plans. */
  leans: Partial<Record<Lean, number>>;
  /**
   * Weights this game plan plays with instead: plays that cost the best
   * planner a little, kept for the variety they bring.
   */
  weights?: Partial<Weights>;
}

export const GAME_PLANS: readonly GamePlan[] = [
  { name: "balanced", leans: {} },
  {
    name: "aerial",
    leans: {
      pass: 6,
      "throw-teammate": 6,
      handoff: 3,
      "reposition:receiver": 3,
      "reposition:throw": 4,
    },
  },
  {
    name: "flank",
    // A runner sent wide cost the best planner 0.75 points of points share
    // over 5,184 paired games, so only this game plan sends one.
    weights: { flank: 3 },
    leans: {
      "reposition:flank": 5,
      "reposition:receiver": 2,
      handoff: 4,
      pass: 3,
    },
  },
  {
    name: "grind",
    leans: { "reposition:cage": 4, carrier: 2, "reposition:screen": 2 },
  },
  {
    name: "bash",
    leans: {
      block: 4,
      blitz: 4,
      "multiple-block": 4,
      "reposition:mark": 2,
    },
  },
];

export interface Variety {
  /** Plans within this many points of the best may be chosen instead. */
  margin: number;
}

/**
 * Standard takes any plan within 8 points of the best, where a touchdown is
 * 100: close calls, never a throw-away.
 */
export const STANDARD_VARIETY: Variety = { margin: 8 };

function lean(plan: GamePlan, a: Activation): number {
  const intent = a.intent;
  const kind: Lean =
    intent.kind === "reposition" ? `reposition:${intent.role}` : intent.kind;
  return plan.leans[kind] ?? 0;
}

/**
 * One of `options`: the best plus the game plan's lean when there is no
 * margin, else any within the margin of it, the closer the likelier. A
 * close call never puts a risky plan, one whose failure is a Turnover,
 * ahead of a safe best plan.
 */
export function choosePlan<T extends { activation: Activation }>(
  options: readonly T[],
  plan: GamePlan,
  variety: Variety,
  rng: CoachRng
): T {
  // Safety is judged on the plans' own values, before any lean: when the
  // best of them is safe, no risky plan may be chosen at all.
  const best = Math.max(...options.map((o) => o.activation.value));
  const safe = options.some(
    (o) => o.activation.value === best && o.activation.tier !== "risky"
  );
  const scored = options
    .filter((o) => !safe || o.activation.tier !== "risky")
    .map((o) => ({ o, score: o.activation.value + lean(plan, o.activation) }));
  const top = Math.max(...scored.map((s) => s.score));
  if (variety.margin <= 0) return scored.find((s) => s.score === top)!.o;
  const floor = top - variety.margin;
  const close = scored.filter((s) => s.score > floor);
  const total = close.reduce((sum, s) => sum + (s.score - floor), 0);
  let roll = rng.next() * total;
  for (const s of close) {
    roll -= s.score - floor;
    if (roll < 0) return s.o;
  }
  return close[close.length - 1].o;
}
