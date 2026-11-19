/**
 * Activations that hit: a block from where the player stands, a blitz to a
 * square beside the target, and free moves that assist the best hit on
 * their carrier.
 */

import { Player } from "../../types/Player";
import { BlockValidator } from "../../game/validators/BlockValidator";
import {
  Board,
  Square,
  carrierOf,
  distance,
  key,
  neighbours,
  standing,
  toGoal,
} from "./board";
import { BlockOdds, blockOdds, casualtyChance, d6 } from "./chance";
import { Route, movesLeft } from "./routes";
import { Context, gamble } from "./activationContext";
import type { Activation } from "./activations";

const blockValidator = new BlockValidator();

/**
 * Knocking down an opponent beside our carrier frees it to move; one
 * standing in the lane ahead of it, within its move, opens the way.
 */
function ourCarrierBonus(
  c: Context,
  carrier: Player,
  target: Player,
  near: number
): number {
  const { board, w } = c;
  if (near === 1) return w.freeCarrier;
  const from = carrier.gridPosition!;
  const at = target.gridPosition!;
  const ahead = toGoal(board, from) - toGoal(board, at);
  const lane =
    ahead > 0 && ahead <= carrier.stats.MA + 2 && Math.abs(at.y - from.y) <= 2;
  return (near <= 2 ? w.knockdown : 0) + (lane ? w.lane : 0);
}

/** How much `attacker` knocking this opponent down is worth. */
export function targetValue(
  c: Context,
  attacker: Player,
  target: Player
): number {
  const { board, w } = c;
  const carrier = carrierOf(board);
  if (carrier?.id === target.id)
    return w.carrierKnockdown + casualtyChance(attacker, target) * c.casualty;
  const near = carrier
    ? distance(target.gridPosition!, carrier.gridPosition!)
    : 99;
  // Near our carrier: a threat to it, or in its way. Next to theirs: a cage
  // wall that, once down, opens the carrier to the next hit.
  const bonus =
    carrier?.teamId === board.us
      ? ourCarrierBonus(c, carrier, target, near)
      : near === 1
        ? w.cageBreak
        : 0;
  const knockdown = carrier && near > 2 ? w.knockdown * w.farHit : w.knockdown;
  return (
    knockdown +
    bonus +
    target.stats.ST +
    casualtyChance(attacker, target) * c.casualty
  );
}

/**
 * The odds of `attacker` blocking `target` from square `from`. Only a hit
 * on the ball carrier is worth the team re-roll; other blocks are judged
 * on the dice alone.
 */
export function blockFrom(
  c: Context,
  attacker: Player,
  target: Player,
  from: Square,
  helper?: { player: Player; at: Square }
): BlockOdds {
  const moved = { ...attacker, gridPosition: from };
  const players = c.board.everyone.map((p) =>
    p.id === attacker.id
      ? moved
      : p.id === helper?.player.id
        ? { ...p, gridPosition: helper.at }
        : p
  );
  const analysis = blockValidator.analyzeBlock(
    moved,
    target,
    players,
    c.board.us
  );
  const reroll = c.teamReroll && carrierOf(c.board)?.id === target.id;
  return blockOdds(
    moved,
    target,
    analysis.diceCount,
    !analysis.isUphill,
    reroll
  );
}

export function blockActivations(c: Context, player: Player): Activation[] {
  const { board, w } = c;
  if (!standing(player)) return [];
  const out: Activation[] = [];
  for (const target of board.theirs) {
    if (
      !standing(target) ||
      distance(target.gridPosition!, player.gridPosition!) !== 1
    )
      continue;
    const odds = blockFrom(c, player, target, player.gridPosition!);
    const value =
      odds.knockdown * targetValue(c, player, target) -
      odds.attackerDown * (c.turnover + w.ownDown);
    if (value <= 0) continue;
    out.push({
      player,
      action: "block",
      intent: { kind: "block", target },
      tier: 1 - odds.attackerDown >= w.sureBlock ? "sure-block" : "risky",
      value,
      rolls: [],
    });
  }
  return out;
}

/** A player beside the opposing carrier is a wall of its cage. */
function isCageWall(board: Board, target: Player): boolean {
  const carrier = carrierOf(board);
  return (
    !!carrier &&
    carrier.teamId !== board.us &&
    carrier.id !== target.id &&
    distance(target.gridPosition!, carrier.gridPosition!) === 1
  );
}

/** Where the blitzer can throw the block from: here, or a reachable square beside the target. */
function blitzSquares(
  player: Player,
  target: Player,
  routes: Map<number, Route>,
  moves: number
): (Route | null)[] {
  const adjacentNow =
    distance(target.gridPosition!, player.gridPosition!) === 1;
  const froms: (Route | null)[] = adjacentNow ? [null] : [];
  for (const s of neighbours(target.gridPosition!)) {
    const route = routes.get(key(s));
    // The block itself costs a square of movement.
    if (route && route.path.length < moves) froms.push(route);
  }
  return froms;
}

/** What the blitzer has to move with: its routes and squares left. */
interface Moves {
  routes: Map<number, Route>;
  normal: number;
  rushes: number;
}

type Blitz = { route: Route | null; value: number; chance: number };

/** The square to blitz `target` from that is worth most. */
function bestBlitz(
  c: Context,
  player: Player,
  target: Player,
  { routes, normal, rushes }: Moves
): Blitz | null {
  const { w } = c;
  let best: Blitz | null = null;
  for (const route of blitzSquares(player, target, routes, normal + rushes)) {
    const from = route?.to ?? player.gridPosition!;
    const odds = blockFrom(c, player, target, from);
    const reach =
      (route?.chance ?? 1) * (route && route.path.length >= normal ? d6(2) : 1);
    const chance = reach * (1 - odds.attackerDown);
    const value =
      reach * odds.knockdown * targetValue(c, player, target) -
      (1 - chance) * (c.turnover + w.ownDown);
    if (!best || value > best.value) best = { route, value, chance };
  }
  return best;
}

/** The best way to blitz `target`, or null if no blitz on it is worth throwing. */
function blitzOn(
  c: Context,
  player: Player,
  target: Player,
  moves: Moves
): Activation | null {
  const { board, w } = c;
  const best = bestBlitz(c, player, target, moves);
  if (!best || best.value <= 0) return null;
  const sure =
    carrierOf(board)?.id === target.id ||
    isCageWall(board, target) ||
    best.chance >= w.sureBlock;
  return {
    player,
    action: "blitz",
    intent: { kind: "blitz", target, route: best.route },
    tier: sure ? "blitz" : "risky",
    value: best.value,
    rolls: best.route?.rolls ?? [],
  };
}

export function blitzActivations(c: Context, player: Player): Activation[] {
  const routes = c.routes(player);
  const [normal, rushes] = movesLeft(c.board, player);
  return c.board.theirs.flatMap((target) => {
    if (!standing(target)) return [];
    const blitz = blitzOn(c, player, target, { routes, normal, rushes });
    return blitz ? [blitz] : [];
  });
}

type Hit = Activation & { intent: { kind: "block" | "blitz" } };

function isHit(a: Activation): a is Hit {
  return a.intent.kind === "block" || a.intent.kind === "blitz";
}

/** The most valuable block or blitz on each opponent. */
function bestHits(hits: Activation[]): Hit[] {
  const best = new Map<string, Hit>();
  for (const a of hits) {
    if (!isHit(a)) continue;
    const held = best.get(a.intent.target.id);
    if (!held || a.value > held.value) best.set(a.intent.target.id, a);
  }
  return [...best.values()];
}

/** What a hit's dice are worth: a knockdown, less the attacker falling. */
interface Stakes {
  knockdown: number;
  fall: number;
}

/** The square beside the target where `player` adds most to the hit. */
function assistRoute(
  c: Context,
  player: Player,
  hit: { player: Player; from: Square; before: BlockOdds },
  target: Player,
  stakes: Stakes
): { route: Route; gain: number } | null {
  const { board, w } = c;
  const { from, before } = hit;
  const routes = c.plainRoutes(player);
  let best: { route: Route; gain: number } | null = null;
  for (const at of neighbours(target.gridPosition!)) {
    if (board.marks[key(at)] !== 1 || (at.x === from.x && at.y === from.y))
      continue;
    const route = routes.get(key(at));
    if (!route || route.chance < w.safeMove) continue;
    const odds = blockFrom(c, hit.player, target, from, { player, at });
    const gain =
      (odds.knockdown - before.knockdown) * stakes.knockdown +
      (before.attackerDown - odds.attackerDown) * stakes.fall;
    if (gain > (best?.gain ?? 0)) best = { route, gain };
  }
  return best;
}

/**
 * How much `player` moving in to assist `hit` is worth, or null. On their
 * carrier every die counts; on anyone else, scaled by `assistAll`, the
 * gain must beat the helper's own best hit, which it gives up by moving.
 */
function assistValue(
  c: Context,
  player: Player,
  hit: Hit,
  own: number
): { route: Route; value: number } | null {
  const { board, w } = c;
  const target = hit.intent.target;
  const onCarrier = carrierOf(board)?.id === target.id;
  const from =
    (hit.intent.kind === "blitz" ? hit.intent.route?.to : null) ??
    hit.player.gridPosition!;
  const thrown = {
    player: hit.player,
    from,
    before: blockFrom(c, hit.player, target, from),
  };
  const stakes = onCarrier
    ? { knockdown: w.carrierKnockdown, fall: c.turnover }
    : {
        knockdown: targetValue(c, hit.player, target),
        fall: c.turnover + w.ownDown,
      };
  const best = assistRoute(c, player, thrown, target, stakes);
  if (!best) return null;
  const gain = onCarrier ? best.gain : best.gain * w.assistAll - own;
  if (gain <= 0) return null;
  return {
    route: best.route,
    value: gamble(c, best.route.chance, hit.value + gain),
  };
}

/** The hit `player` adds most to by moving in to assist it, if any. */
function bestAssist(
  c: Context,
  player: Player,
  aimed: Hit[],
  hits: Activation[]
): { route: Route; value: number } | null {
  const own = Math.max(
    0,
    ...hits
      .filter((a) => isHit(a) && a.player.id === player.id)
      .map((a) => a.value)
  );
  let best: { route: Route; value: number } | null = null;
  for (const hit of aimed) {
    if (hit.player.id === player.id) continue;
    const assist = assistValue(c, player, hit, own);
    if (assist && assist.value > (best?.value ?? 0)) best = assist;
  }
  return best;
}

/**
 * Free moves that give a hit a better die, made before it is thrown: the
 * best hit on their carrier and, with `assistAll` above 0, the best hit
 * on every other opponent. A square beside the target only assists if
 * nobody else marks it.
 */
export function assistActivations(
  c: Context,
  hits: Activation[]
): Activation[] {
  const { board, w } = c;
  const carrier = carrierOf(board);
  const theirs = carrier && carrier.teamId !== board.us ? carrier : null;
  const aimed = bestHits(hits).filter(
    (h) => h.intent.target.id === theirs?.id || w.assistAll > 0
  );
  if (!aimed.length) return [];
  return board.ours.flatMap((player) => {
    if (!c.available.get(player.id)?.has("move")) return [];
    const best = bestAssist(c, player, aimed, hits);
    return best
      ? [
          {
            player,
            action: "move" as const,
            intent: {
              kind: "reposition" as const,
              role: "mark" as const,
              route: best.route,
            },
            tier: "assist" as const,
            value: best.value,
            rolls: best.route.rolls,
          },
        ]
      : [];
  });
}
