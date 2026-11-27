import type { CoachRng } from "../rng";
import type { Activation } from "./activations";
import type { Weights } from "./weights";
import { bestBy } from "../../game/core/order";

type Lean =
  | Exclude<Activation["intent"]["kind"], "reposition">
  | `reposition:${Extract<Activation["intent"], { kind: "reposition" }>["role"]}`;

export interface GamePlan {
  name: string;

  leans: Partial<Record<Lean, number>>;

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
      "reposition:deep": 4,
      "reposition:throw": 4,
    },
  },
  {
    name: "flank",

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
      foul: 4,
      "reposition:mark": 2,
    },
  },
];

export interface Variety {
  margin: number;
}

export const STANDARD_VARIETY: Variety = { margin: 8 };

function lean(plan: GamePlan, a: Activation): number {
  const intent = a.intent;
  const kind: Lean =
    intent.kind === "reposition" ? `reposition:${intent.role}` : intent.kind;
  return plan.leans[kind] ?? 0;
}

interface ChoosePlanArgs<T> {
  options: readonly T[];
  plan: GamePlan;
  variety: Variety;
  rng: CoachRng;
}

export function choosePlan<T extends { activation: Activation }>({
  options,
  plan,
  variety,
  rng,
}: ChoosePlanArgs<T>): T {
  const best = Math.max(...options.map((o) => o.activation.value));

  const scoring = options.find(
    (o) => o.activation.value === best && o.activation.intent.kind === "score"
  );
  if (scoring) return scoring;
  const safe = options.some(
    (o) => o.activation.value === best && o.activation.tier !== "risky"
  );
  const scored = options
    .filter((o) => !safe || o.activation.tier !== "risky")
    .map((o) => ({ o, score: o.activation.value + lean(plan, o.activation) }));
  const topEntry = bestBy(scored, (entry) => entry.score);
  if (!topEntry) throw new Error("No activation to choose from");
  if (variety.margin <= 0) return topEntry.o;
  const top = topEntry.score;
  const floor = top - variety.margin;
  const close = scored.filter((s) => s.score > floor);
  const total = close.reduce((sum, s) => sum + (s.score - floor), 0);
  let roll = rng.next() * total;
  let last = topEntry.o;
  for (const s of close) {
    last = s.o;
    roll -= s.score - floor;
    if (roll < 0) return s.o;
  }
  return last;
}
