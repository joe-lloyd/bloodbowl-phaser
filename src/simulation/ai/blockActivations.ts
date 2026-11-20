import { type FieldPlayer as Player } from "./board";

import { BlockValidator } from "../../game/validators/BlockValidator";
import {
  type Board,
  type Square,
  carrierOf,
  distance,
  key,
  neighbours,
  standing,
  toGoal,
} from "./board";
import { type BlockOdds, blockOdds, casualtyChance, d6 } from "./chance";
import { blockFaces } from "./wrestle";
import { type Route, movesLeft } from "./routes";
import { type Context, gamble } from "./activationContext";
import type { Activation } from "./activations";

const blockValidator = new BlockValidator();

interface OurCarrierBonusArgs {
  c: Context;
  carrier: Player;
  target: Player;
  near: number;
}

function ourCarrierBonus({
  c,
  carrier,
  target,
  near,
}: OurCarrierBonusArgs): number {
  const { board, w } = c;
  if (near === 1) return w.freeCarrier;
  const from = carrier.gridPosition;
  const at = target.gridPosition;
  const ahead = toGoal(board, from) - toGoal(board, at);
  const lane =
    ahead > 0 && ahead <= carrier.stats.MA + 2 && Math.abs(at.y - from.y) <= 2;
  return (near <= 2 ? w.knockdown : 0) + (lane ? w.lane : 0);
}

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
    ? distance(target.gridPosition, carrier.gridPosition)
    : 99;

  let bonus = near === 1 ? w.cageBreak : 0;
  if (carrier?.teamId === board.us)
    bonus = ourCarrierBonus({ c, carrier, target, near });
  return (
    w.knockdown +
    bonus +
    target.stats.ST +
    casualtyChance(attacker, target) * c.casualty
  );
}

interface BlockFromArgs {
  c: Context;
  attacker: Player;
  target: Player;
  from: Square;
  helper?: { player: Player; at: Square };
}

export function blockFrom({
  c,
  attacker,
  target,
  from,
  helper,
}: BlockFromArgs): BlockOdds {
  const moved = { ...attacker, gridPosition: from };
  const players = c.board.everyone.map((p) => {
    if (p.id === attacker.id) return moved;
    return p.id === helper?.player.id ? { ...p, gridPosition: helper.at } : p;
  });
  const analysis = blockValidator.analyzeBlock({
    attacker: moved,
    defender: target,
    allPlayers: players,
    activeTeamId: c.board.us,
  });
  const reroll = c.teamReroll && carrierOf(c.board)?.id === target.id;
  return blockOdds({
    dice: analysis.diceCount,
    attackerPicks: !analysis.isUphill,
    teamReroll: reroll,
    faces: blockFaces(c.board, moved, target),
  });
}

export function blockActivations(c: Context, player: Player): Activation[] {
  const { board, w } = c;
  if (!standing(player)) return [];
  const out: Activation[] = [];
  for (const target of board.theirs) {
    if (
      !standing(target) ||
      distance(target.gridPosition, player.gridPosition) !== 1
    )
      continue;
    const odds = blockFrom({
      c: c,
      attacker: player,
      target: target,
      from: player.gridPosition,
    });
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

function isCageWall(board: Board, target: Player): boolean {
  const carrier = carrierOf(board);
  return (
    !!carrier &&
    carrier.teamId !== board.us &&
    carrier.id !== target.id &&
    distance(target.gridPosition, carrier.gridPosition) === 1
  );
}

interface BlitzSquaresArgs {
  player: Player;
  target: Player;
  routes: Map<number, Route>;
  moves: number;
}

function blitzSquares({
  player,
  target,
  routes,
  moves,
}: BlitzSquaresArgs): (Route | null)[] {
  const adjacentNow = distance(target.gridPosition, player.gridPosition) === 1;
  const froms: (Route | null)[] = adjacentNow ? [null] : [];
  for (const s of neighbours(target.gridPosition)) {
    const route = routes.get(key(s));

    if (route && route.path.length < moves) froms.push(route);
  }
  return froms;
}

interface Moves {
  routes: Map<number, Route>;
  normal: number;
  rushes: number;
}

interface Blitz {
  route: Route | null;
  value: number;
  chance: number;
}

interface BestBlitzArgs {
  c: Context;
  player: Player;
  target: Player;
  moves: Moves;
}

function blitzReach(route: Route | null, normal: number): number {
  return (
    (route?.chance ?? 1) * (route && route.path.length >= normal ? d6(2) : 1)
  );
}

export interface MarkerHit {
  attacker: Player;
  target: Player;
  route: Route | null;
}

export function hitKeepsTurnChance(c: Context, hit: MarkerHit): number {
  const [normal] = movesLeft(c.board, hit.attacker);
  const odds = blockFrom({
    c,
    attacker: hit.attacker,
    target: hit.target,
    from: hit.route?.to ?? hit.attacker.gridPosition,
  });
  return blitzReach(hit.route, normal) * (1 - odds.attackerDown);
}

function bestBlitz({
  c,
  player,
  target,
  moves: { routes, normal, rushes },
}: BestBlitzArgs): Blitz | null {
  const { w } = c;
  let best: Blitz | null = null;
  for (const route of blitzSquares({
    player: player,
    target: target,
    routes: routes,
    moves: normal + rushes,
  })) {
    const from = route?.to ?? player.gridPosition;
    const odds = blockFrom({
      c: c,
      attacker: player,
      target: target,
      from: from,
    });
    const reach = blitzReach(route, normal);
    const chance = reach * (1 - odds.attackerDown);
    const value =
      reach * odds.knockdown * targetValue(c, player, target) -
      (1 - chance) * (c.turnover + w.ownDown);
    if (!best || value > best.value) best = { route, value, chance };
  }
  return best;
}

interface BlitzOnArgs {
  c: Context;
  player: Player;
  target: Player;
  moves: Moves;
}

function blitzOn({ c, player, target, moves }: BlitzOnArgs): Activation | null {
  const { board, w } = c;
  const best = bestBlitz({
    c: c,
    player: player,
    target: target,
    moves: moves,
  });
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
    const blitz = blitzOn({
      c: c,
      player: player,
      target: target,
      moves: { routes, normal, rushes },
    });
    return blitz ? [blitz] : [];
  });
}

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

interface AssistRouteArgs {
  c: Context;
  player: Player;
  hit: { player: Player; from: Square; before: BlockOdds };
  carrier: Player;
}

function assistRoute({
  c,
  player,
  hit,
  carrier,
}: AssistRouteArgs): { route: Route; gain: number } | null {
  const { board, w } = c;
  const { from, before } = hit;
  const routes = c.plainRoutes(player);
  let best: { route: Route; gain: number } | null = null;
  for (const at of neighbours(carrier.gridPosition)) {
    if (
      board.marks.getUint8(key(at)) !== 1 ||
      (at.x === from.x && at.y === from.y)
    )
      continue;
    const route = routes.get(key(at));
    if (!route || route.chance < w.safeMove) continue;
    const odds = blockFrom({
      c: c,
      attacker: hit.player,
      target: carrier,
      from: from,
      helper: { player, at },
    });
    const gain =
      (odds.knockdown - before.knockdown) * w.carrierKnockdown +
      (before.attackerDown - odds.attackerDown) * c.turnover;
    if (gain > (best?.gain ?? 0)) best = { route, gain };
  }
  return best;
}

export function assistActivations(
  c: Context,
  hits: Activation[]
): Activation[] {
  const { board } = c;
  const carrier = carrierOf(board);
  if (!carrier || carrier.teamId === board.us) return [];
  const hit = bestHitOn(hits, carrier);
  if (!hit) return [];
  const from =
    (hit.intent.kind === "blitz" ? hit.intent.route?.to : null) ??
    hit.player.gridPosition;
  const thrown = {
    player: hit.player,
    from,
    before: blockFrom({
      c: c,
      attacker: hit.player,
      target: carrier,
      from: from,
    }),
  };
  const out: Activation[] = [];
  const helpers = board.ours.filter(
    (player) =>
      player.id !== hit.player.id && c.available.get(player.id)?.has("move")
  );
  for (const player of helpers) {
    const best = assistRoute({
      c: c,
      player: player,
      hit: thrown,
      carrier: carrier,
    });
    if (best)
      out.push({
        player,
        action: "move",
        intent: { kind: "reposition", role: "mark", route: best.route },
        tier: "assist",
        value: gamble(c, best.route.chance, hit.value + best.gain),
        rolls: best.route.rolls,
      });
  }
  return out;
}

export function carrierBlitzActivations(
  c: Context,
  carrier: Player
): Activation[] {
  const { board, w } = c;
  const out: Activation[] = [];
  for (const marker of board.theirs) {
    if (
      !standing(marker) ||
      distance(marker.gridPosition, carrier.gridPosition) !== 1
    )
      continue;
    const odds = blockFrom({
      c,
      attacker: carrier,
      target: marker,
      from: carrier.gridPosition,
    });
    const value =
      odds.knockdown * targetValue(c, carrier, marker) -
      odds.attackerDown * (c.turnover + w.ownDown + w.ballLoss);
    if (value > 0)
      out.push({
        player: carrier,
        action: "blitz",
        intent: { kind: "blitz", target: marker, route: null },
        tier: "blitz",
        value,
        rolls: [],
      });
  }
  return out;
}
