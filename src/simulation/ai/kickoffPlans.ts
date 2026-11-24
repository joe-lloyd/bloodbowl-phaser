import type { ActionType } from "../../types/events";
import type { Activation } from "./activations";
import {
  blitzActivations,
  blockActivations,
  blockFrom,
} from "./blockActivations";
import { type FieldPlayer as Player, distance, key } from "./board";
import { gatePriced } from "./gateActivations";
import {
  type KickoffGround,
  likelyReceivers,
  teamSquares,
  underSquare,
} from "./kickoffGround";
import { type RoleSquare, repositionActivation } from "./repositionActivations";

const BALL_SIDE = 3;

interface PlanArgs {
  ground: KickoffGround;
  player: Player;
  actions: ReadonlySet<ActionType>;
  squares: readonly RoleSquare[];
}

function nearTheKick(ground: KickoffGround, target: Player): boolean {
  const { landing } = ground;
  const close = landing && distance(target.gridPosition, landing) <= BALL_SIDE;
  return !!close || likelyReceivers(ground).some(({ id }) => id === target.id);
}

function pricedHit(ground: KickoffGround, plan: Activation): Activation {
  const { c, kicking } = ground;
  const { intent, player } = plan;
  if (intent.kind !== "blitz" && intent.kind !== "block") return plan;
  if (!kicking || !nearTheKick(ground, intent.target)) return plan;
  const from =
    intent.kind === "blitz" && intent.route
      ? intent.route.to
      : player.gridPosition;
  const { knockdown } = blockFrom({
    c,
    attacker: player,
    target: intent.target,
    from,
    blitz: intent.kind === "blitz",
  });
  return { ...plan, value: plan.value + knockdown * c.w.cageBreak };
}

function rawPlans({ ground, player, actions, squares }: PlanArgs) {
  const { c, landing } = ground;
  const out: Activation[] = [];
  const underTheBall = landing && key(player.gridPosition) === key(landing);
  if (underTheBall && actions.has("move")) return out;
  if (actions.has("move"))
    out.push(
      ...repositionActivation(c, player, [
        ...squares,
        ...underSquare(ground, player),
      ])
    );
  if (actions.has("blitz")) out.push(...blitzActivations(c, player));
  if (actions.has("block")) out.push(...blockActivations(c, player));
  return out;
}

export function playerPlans(args: PlanArgs): Activation[] {
  const { c } = args.ground;
  return gatePriced(
    c,
    rawPlans(args).map((plan) => pricedHit(args.ground, plan))
  )
    .filter((plan) => plan.value > 0)
    .sort((a, b) => b.value - a.value);
}

const isHit = ({ action }: Activation) => action !== "move";

function endSquare({ intent }: Activation): number | null {
  return "route" in intent && intent.route ? key(intent.route.to) : null;
}

export function teamPlans(ground: KickoffGround, limit: number): Activation[] {
  const { board, available } = ground.c;
  const chosen: Activation[] = [];
  let squares = teamSquares(ground);
  while (chosen.length < limit) {
    const blitzed = chosen.some(isHit);
    const best = board.ours
      .filter((p) => !chosen.some(({ player }) => player.id === p.id))
      .flatMap((player) =>
        playerPlans({
          ground,
          player,
          actions: available.get(player.id) ?? new Set(),
          squares,
        }).filter((plan) => !blitzed || !isHit(plan))
      )
      .filter((plan) => !chosen.some((c) => sharesSquare(c, plan)))
      .reduce<Activation | null>(
        (top, plan) => (top && top.value >= plan.value ? top : plan),
        null
      );
    if (!best) break;
    chosen.push(best);
    const taken = endSquare(best);
    squares = squares.filter(({ at }) => key(at) !== taken);
  }
  return chosen.sort((a, b) => Number(isHit(a)) - Number(isHit(b)));
}

function sharesSquare(a: Activation, b: Activation): boolean {
  const at = endSquare(a);
  return at !== null && at === endSquare(b);
}
