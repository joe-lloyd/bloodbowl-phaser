/**
 * The safest path to every square a player can reach this activation, by
 * the chance of making every Dodge, Rush and Pick-up on the way rather than
 * by distance.
 */

import { Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { requiredRoll } from "../../game/rules/rollTargets";
import { pickupTarget } from "../../game/rules/rollPreview";
import { weatherEffects } from "../../game/rules/weather";
import { rushAllowance, standUpCost } from "../../game/skills/movement";
import { withDriveModifiers } from "../../game/kickoff/driveEffects";
import {
  Board,
  HEIGHT,
  Square,
  WIDTH,
  distance,
  key,
  neighbours,
} from "./board";
import { CERTAIN, Chance, RollTarget, chain } from "./chance";

const NO_ROLLS: RollTarget[] = [];

export interface Route {
  to: Square;
  /** Squares to step through in order, excluding the start. */
  path: Square[];
  rolls: RollTarget[];
  chance: Chance;
}

const CELLS = WIDTH * HEIGHT;
const square = (k: number): Square => ({
  x: k % WIDTH,
  y: Math.floor(k / WIDTH),
});

/** The roll targets for one step from `from` into `to`. */
function stepRolls(
  board: Board,
  player: Player,
  from: Square,
  to: Square,
  rush: boolean
): RollTarget[] {
  const rolls: RollTarget[] = [];
  if (rush)
    rolls.push({
      kind: "rush",
      target: requiredRoll(2, weatherEffects(board.weather).rush ?? 0),
    });
  if (board.marks[key(from)] > 0) {
    const modifier = hasSkill(player.skills, SkillType.STUNTY)
      ? 0
      : -board.marks[key(to)];
    const twoHeads = hasSkill(player.skills, SkillType.TWO_HEADS) ? 1 : 0;
    const tackled = board.theirs.some(
      (o) =>
        hasTackleZone(o) &&
        hasSkill(o.skills, SkillType.TACKLE) &&
        distance(o.gridPosition!, from) === 1
    );
    rolls.push({
      kind: "dodge",
      target: requiredRoll(player.stats.AG, modifier + twoHeads),
      ...(tackled ? { noSkillReroll: true as const } : {}),
    });
  }
  if (board.ball.kind === "loose" && key(board.ball.at) === key(to))
    rolls.push({
      kind: "pickup",
      target: pickupTarget(player, to, board.theirs, board.weather),
    });
  return rolls;
}

/** Squares left this activation: [normal steps, rushes]. */
export function movesLeft(board: Board, player: Player): [number, number] {
  const fielded = withDriveModifiers(player, board.gs.getState());
  let used = board.gs.getMovementUsed(player.id);
  if (player.status === PlayerStatus.PRONE) used += standUpCost(fielded);
  const ma = fielded.stats.MA;
  const rushes = rushAllowance(fielded) - Math.max(0, used - ma);
  return [Math.max(0, ma - used), Math.max(0, rushes)];
}

// One search's working space, reused: this runs thousands of times a game.
const MAX_STEPS = 16;
const bestAt = Array.from(
  { length: MAX_STEPS + 1 },
  () => new Float64Array(CELLS)
);
const parentAt = Array.from(
  { length: MAX_STEPS + 1 },
  () => new Int16Array(CELLS)
);

/** Each cell's neighbours by key, in the order `neighbours` gives them. */
const NEIGHBOURS = Array.from({ length: CELLS }, (_, cell) =>
  neighbours(square(cell)).map(key)
);

const rollChance = (target: number) =>
  (7 - Math.min(6, Math.max(2, target))) / 6;

/**
 * Every square the player can reach, each by its safest path, judged on its
 * own dice. A loose ball square ends a path (stepping on it is a Pick-up);
 * other players block.
 */
export function routesFor(board: Board, player: Player): Map<number, Route> {
  const start = player.gridPosition!;
  const [normal, rushes] = movesLeft(board, player);
  const steps = Math.min(MAX_STEPS, normal + rushes);
  const ballKey = board.ball.kind === "loose" ? key(board.ball.at) : -1;

  // The chance of each step, by what it depends on.
  const rush = rollChance(
    requiredRoll(2, weatherEffects(board.weather).rush ?? 0)
  );
  const stunty = hasSkill(player.skills, SkillType.STUNTY);
  const twoHeads = hasSkill(player.skills, SkillType.TWO_HEADS) ? 1 : 0;
  const dodgeInto = Array.from({ length: 9 }, (_, marks) =>
    rollChance(requiredRoll(player.stats.AG, (stunty ? 0 : -marks) + twoHeads))
  );
  const pickup =
    ballKey >= 0
      ? rollChance(
          pickupTarget(player, square(ballKey), board.theirs, board.weather)
        )
      : 1;

  // bestAt[k][cell]: chance of reaching cell in exactly k steps (-1: never)
  for (let k = 0; k <= steps; k++) bestAt[k].fill(-1);
  bestAt[0][key(start)] = 1;
  for (let k = 0; k < steps; k++) {
    const stepRush = k >= normal ? rush : 1;
    for (let cell = 0; cell < CELLS; cell++) {
      const p = bestAt[k][cell];
      if (p < 0 || (cell === ballKey && k > 0)) continue;
      const leavesZone = board.marks[cell] > 0;
      for (const next of NEIGHBOURS[cell]) {
        if (board.occupant[next]) continue;
        let chance = stepRush;
        if (leavesZone) chance *= dodgeInto[board.marks[next]];
        if (next === ballKey) chance *= pickup;
        const q = p * chance;
        if (q > bestAt[k + 1][next]) {
          bestAt[k + 1][next] = q;
          parentAt[k + 1][next] = cell;
        }
      }
    }
  }

  const out = new Map<number, Route>();
  for (let cell = 0; cell < CELLS; cell++) {
    if (cell === key(start)) continue;
    let bestK = -1;
    for (let k = 1; k <= steps; k++)
      if (bestAt[k][cell] > (bestK < 0 ? 0 : bestAt[bestK][cell] + 1e-9))
        bestK = k;
    if (bestK < 0) continue;
    const path: Square[] = new Array(bestK);
    for (let k = bestK, c = cell; k > 0; c = parentAt[k][c], k--)
      path[k - 1] = square(c);
    // A path whose chance is exactly 1 rolled nothing.
    let rolls: RollTarget[] = NO_ROLLS;
    if (bestAt[bestK][cell] !== 1) {
      rolls = [];
      let from = start;
      for (let i = 0; i < path.length; i++) {
        rolls.push(...stepRolls(board, player, from, path[i], i >= normal));
        from = path[i];
      }
    }
    out.set(cell, {
      to: square(cell),
      path,
      rolls,
      chance: rolls.length ? chain(player, rolls, false) : CERTAIN,
    });
  }
  return out;
}

/** The same paths with a team re-roll to hand for the dice on them. */
export function withTeamReroll(
  routes: Map<number, Route>,
  player: Player
): Map<number, Route> {
  const out = new Map<number, Route>();
  for (const [cell, route] of routes)
    out.set(
      cell,
      route.rolls.length
        ? { ...route, chance: chain(player, route.rolls, true) }
        : route
    );
  return out;
}
