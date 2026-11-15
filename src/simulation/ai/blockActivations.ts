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
} from "./board";
import { BlockOdds, blockOdds, casualtyChance, d6 } from "./chance";
import { Route, movesLeft } from "./routes";
import { Context } from "./activationContext";
import type { Activation } from "./activations";

const blockValidator = new BlockValidator();

/** How much `attacker` knocking this opponent down is worth. */
function targetValue(c: Context, attacker: Player, target: Player): number {
  const { board, w } = c;
  const carrier = carrierOf(board);
  if (carrier?.id === target.id)
    return w.carrierKnockdown + casualtyChance(attacker, target) * c.casualty;
  const near = carrier
    ? distance(target.gridPosition!, carrier.gridPosition!)
    : 99;
  // Near our carrier: a threat to it. Next to theirs: a cage wall that,
  // once down, opens the carrier to the next hit.
  const bonus =
    carrier?.teamId === board.us
      ? near <= 2
        ? w.knockdown
        : 0
      : near === 1
        ? w.cageBreak
        : 0;
  return (
    w.knockdown +
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
function blockFrom(
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

/** The most valuable block or blitz aimed at `carrier`, or null. */
function bestHitOn(hits: Activation[], carrier: Player): Activation | null {
  let hit: Activation | null = null;
  for (const a of hits) {
    const aimed =
      a.intent.kind === "block" || a.intent.kind === "blitz"
        ? a.intent.target.id === carrier.id
        : false;
    if (aimed && (!hit || a.value > hit.value)) hit = a;
  }
  return hit;
}

/** The square beside the carrier where `player` adds most to the hit. */
function assistRoute(
  c: Context,
  player: Player,
  hit: { player: Player; from: Square; before: BlockOdds },
  carrier: Player
): { route: Route; gain: number } | null {
  const { board, w } = c;
  const { from, before } = hit;
  const routes = c.plainRoutes(player);
  let best: { route: Route; gain: number } | null = null;
  for (const at of neighbours(carrier.gridPosition!)) {
    if (board.marks[key(at)] !== 1 || (at.x === from.x && at.y === from.y))
      continue;
    const route = routes.get(key(at));
    if (!route || route.chance < w.safeMove) continue;
    const odds = blockFrom(c, hit.player, carrier, from, { player, at });
    const gain =
      (odds.knockdown - before.knockdown) * w.carrierKnockdown +
      (before.attackerDown - odds.attackerDown) * c.turnover;
    if (gain > (best?.gain ?? 0)) best = { route, gain };
  }
  return best;
}

/**
 * Free moves that give the best hit on their carrier a better die, made
 * before it is thrown. A square beside the carrier only assists if nobody
 * else marks it.
 */
export function assistActivations(
  c: Context,
  hits: Activation[]
): Activation[] {
  const { board } = c;
  const carrier = carrierOf(board);
  if (!carrier || carrier.teamId === board.us) return [];
  const hit = bestHitOn(hits, carrier);
  if (!hit || (hit.intent.kind !== "block" && hit.intent.kind !== "blitz"))
    return [];
  const from =
    (hit.intent.kind === "blitz" ? hit.intent.route?.to : null) ??
    hit.player.gridPosition!;
  const thrown = {
    player: hit.player,
    from,
    before: blockFrom(c, hit.player, carrier, from),
  };
  const out: Activation[] = [];
  for (const player of board.ours) {
    if (player.id === hit.player.id || !c.available.get(player.id)?.has("move"))
      continue;
    const best = assistRoute(c, player, thrown, carrier);
    if (best)
      out.push({
        player,
        action: "move",
        intent: { kind: "reposition", role: "mark", route: best.route },
        tier: "assist",
        value: best.gain,
        rolls: best.route.rolls,
      });
  }
  return out;
}
