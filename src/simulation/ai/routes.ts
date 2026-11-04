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
import { Chance, RollTarget, chain } from "./chance";

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

const rawChance = (rolls: RollTarget[]) =>
  rolls.reduce((p, r) => p * ((7 - Math.min(6, Math.max(2, r.target))) / 6), 1);

/** Squares left this activation: [normal steps, rushes]. */
export function movesLeft(board: Board, player: Player): [number, number] {
  const fielded = withDriveModifiers(player, board.gs.getState());
  let used = board.gs.getMovementUsed(player.id);
  if (player.status === PlayerStatus.PRONE) used += standUpCost(fielded);
  const ma = fielded.stats.MA;
  const rushes = rushAllowance(fielded) - Math.max(0, used - ma);
  return [Math.max(0, ma - used), Math.max(0, rushes)];
}

/**
 * Every square the player can reach, each by its safest path. A loose ball
 * square ends a path (stepping on it is a Pick-up); other players block.
 */
export function routesFor(
  board: Board,
  player: Player,
  teamReroll: boolean
): Map<number, Route> {
  const start = player.gridPosition!;
  const [normal, rushes] = movesLeft(board, player);
  const steps = normal + rushes;
  const ballKey = board.ball.kind === "loose" ? key(board.ball.at) : -1;
  // best[k][cell]: chance of reaching cell in exactly k steps (-1: never)
  const best = Array.from({ length: steps + 1 }, () =>
    new Float64Array(CELLS).fill(-1)
  );
  const parent = Array.from({ length: steps + 1 }, () =>
    new Int16Array(CELLS).fill(-1)
  );
  best[0][key(start)] = 1;
  for (let k = 0; k < steps; k++) {
    for (let cell = 0; cell < CELLS; cell++) {
      const p = best[k][cell];
      if (p < 0 || (cell === ballKey && k > 0)) continue;
      const from = square(cell);
      for (const to of neighbours(from)) {
        const next = key(to);
        if (board.occupant[next]) continue;
        const q =
          p * rawChance(stepRolls(board, player, from, to, k >= normal));
        if (q > best[k + 1][next]) {
          best[k + 1][next] = q;
          parent[k + 1][next] = cell;
        }
      }
    }
  }

  const out = new Map<number, Route>();
  for (let cell = 0; cell < CELLS; cell++) {
    if (cell === key(start)) continue;
    let bestK = -1;
    for (let k = 1; k <= steps; k++)
      if (best[k][cell] > (bestK < 0 ? 0 : best[bestK][cell] + 1e-9)) bestK = k;
    if (bestK < 0) continue;
    const path: Square[] = [];
    for (let k = bestK, c = cell; k > 0; c = parent[k][c], k--)
      path.unshift(square(c));
    const rolls: RollTarget[] = [];
    let from = start;
    path.forEach((to, i) => {
      rolls.push(...stepRolls(board, player, from, to, i >= normal));
      from = to;
    });
    out.set(cell, {
      to: square(cell),
      path,
      rolls,
      chance: chain(player, rolls, teamReroll),
    });
  }
  return out;
}
