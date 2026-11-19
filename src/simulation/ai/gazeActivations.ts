import { type FieldPlayer as Player } from "./board";
import { hasTackleZone, PlayerCondition } from "../../types/Player";
import { hasSkill, SkillType } from "../../types/Skills";
import {
  type Context,
  context,
  gamble,
  scoreChanceOf,
} from "./activationContext";
import type { Activation } from "./activations";
import { blockActivations, blitzActivations } from "./blockActivations";
import {
  type Board,
  carrierOf,
  distance,
  key,
  neighbours,
  standing,
} from "./board";
import { d6 } from "./chance";
import { feedingCost, unfedChance } from "./feeding";
import type { Route } from "./routes";

function distractedBoard(board: Board, target: Player): Board {
  const distracted = {
    ...target,
    conditions: [
      ...(target.conditions ?? []),
      { type: PlayerCondition.DISTRACTED },
    ],
  };
  const replace = (p: Player) => (p.id === target.id ? distracted : p);
  const marks = new DataView(board.marks.buffer.slice(0));
  for (const at of neighbours(target.gridPosition))
    marks.setUint8(key(at), marks.getUint8(key(at)) - 1);
  const occupant = [...board.occupant];
  occupant[key(target.gridPosition)] = distracted;
  return {
    ...board,
    theirs: board.theirs.map(replace),
    everyone: board.everyone.map(replace),
    occupant,
    marks,
  };
}

function gazerAt(
  board: Board,
  player: Player,
  at: { x: number; y: number }
): Board {
  const moved = { ...player, gridPosition: at };
  const replace = (p: Player) => (p.id === player.id ? moved : p);
  const occupant = [...board.occupant];
  occupant[key(player.gridPosition)] = undefined;
  occupant[key(at)] = moved;
  return {
    ...board,
    ours: board.ours.map(replace),
    everyone: board.everyone.map(replace),
    occupant,
  };
}

function hitValue(c: Context, player: Player, carrier: Player): number {
  const actions = c.available.get(player.id);
  const hits = [
    ...(actions?.has("block") ? blockActivations(c, player) : []),
    ...(actions?.has("blitz") ? blitzActivations(c, player) : []),
  ];
  return Math.max(
    0,
    ...hits
      .filter(
        (hit) =>
          (hit.intent.kind === "block" || hit.intent.kind === "blitz") &&
          hit.intent.target.id === carrier.id
      )
      .map((hit) => hit.value)
  );
}

function followupValue(c: Context, gazer: Player): number {
  const carrier = carrierOf(c.board);
  if (!carrier) return 0;
  if (carrier.teamId === c.board.us)
    return c.available.get(carrier.id)?.has("move") && carrier.id !== gazer.id
      ? scoreChanceOf(c, carrier) * c.w.touchdown
      : 0;
  return Math.max(
    0,
    ...c.board.ours
      .filter((p) => p.id !== gazer.id)
      .map((p) => hitValue(c, p, carrier))
  );
}

function gazeRoutes(
  c: Context,
  player: Player,
  target: Player
): (Route | null)[] {
  const routes = c.plainRoutes(player);
  const froms: (Route | null)[] =
    standing(player) && distance(player.gridPosition, target.gridPosition) === 1
      ? [null]
      : [];
  for (const at of neighbours(target.gridPosition)) {
    const route = routes.get(key(at));
    if (
      route &&
      !(c.board.ball.kind === "loose" && key(route.to) === key(c.board.ball.at))
    )
      froms.push(route);
  }
  return froms;
}

interface GazePlanArgs {
  c: Context;
  player: Player;
  target: Player;
  route: Route | null;
  baseline: { value: number; alternative: number };
}

function gazePlan({
  c,
  player,
  target,
  route,
  baseline,
}: GazePlanArgs): Activation[] {
  const { board, w } = c;
  const at = route?.to ?? player.gridPosition;
  const placed = gazerAt(board, player, at);
  const before = followupValue(
    context({
      board: placed,
      w: w,
      available: c.available,
      skillPlans: c.skillPlans,
    }),
    player
  );
  const after = followupValue(
    context({
      board: distractedBoard(placed, target),
      w: w,
      available: c.available,
      skillPlans: c.skillPlans,
    }),
    player
  );
  const gain = after - Math.max(before, baseline.value);
  if (gain <= 1) return [];
  const reach = route?.chance ?? 1;
  const value =
    gamble(
      c,
      reach,
      before +
        (1 - unfedChance({ c: c, player: player, action: "gaze", at: at })) *
          d6(3) *
          gain
    ) -
    feedingCost({ c: c, player: player, action: "gaze", at: at }) -
    baseline.alternative;
  return [
    {
      player,
      action: "gaze",
      intent: { kind: "gaze", target, route },
      tier: "prepare",
      value,
      rolls: route?.rolls ?? [],
    },
  ];
}

export function gazeActivations(c: Context, player: Player): Activation[] {
  if (
    !hasSkill(player.skills, SkillType.HYPNOTIC_GAZE) ||
    carrierOf(c.board)?.id === player.id
  )
    return [];
  const alternative = c.available.get(player.id)?.has("block")
    ? Math.max(0, ...blockActivations(c, player).map((a) => a.value))
    : 0;
  const baseline = { value: followupValue(c, player), alternative };
  return c.board.theirs.filter(hasTackleZone).flatMap((target) =>
    gazeRoutes(c, player, target).flatMap((route) =>
      gazePlan({
        c: c,
        player: player,
        target: target,
        route: route,
        baseline: baseline,
      })
    )
  );
}
