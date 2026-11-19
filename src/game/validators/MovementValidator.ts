import { type Player, PlayerStatus } from "@/types/Player";
import { moveAllowance, standUpCost } from "../skills/movement";
import { GameConfig } from "@/config/GameConfig";
import { MovementPathSearch } from "./MovementPathSearch";
import {
  adjacentPathSteps,
  inPitchBounds,
  movementTackleZones,
  occupiedSquare,
} from "./movementSquares";
import type { MovementSquare } from "./movementSquares";

export interface MovementResult {
  valid: boolean;
  path: MovementSquare[];
  rolls: MovementRoll[];
  cost: number;
}

interface MovementRoll {
  type: "dodge" | "gfi" | "rush";
  target: number;
  modifiers: number;
  square: MovementSquare;
}

interface PathInput {
  player: Player;
  path: MovementSquare[];
  opponents: Player[];
  teammates?: Player[] | undefined;
  movementUsed?: number | undefined;
}

type ReachableSquare = MovementSquare & { cost: number };

function invalidResult(): MovementResult {
  return { valid: false, path: [], rolls: [], cost: 0 };
}

function pitchSquare(square: MovementSquare): boolean {
  return (
    Number.isInteger(square.x) &&
    Number.isInteger(square.y) &&
    inPitchBounds(square)
  );
}

function validStep(
  from: MovementSquare,
  to: MovementSquare,
  occupants: Player[]
): boolean {
  return (
    Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) === 1 &&
    inPitchBounds(to) &&
    !occupiedSquare(to, occupants)
  );
}

function stepRolls(input: {
  from: MovementSquare;
  to: MovementSquare;
  player: Player;
  opponents: Player[];
  steps: number;
}): MovementRoll[] {
  const { from, to, player, opponents, steps } = input;
  const rolls: MovementRoll[] = [];
  if (movementTackleZones(from, opponents) > 0) {
    const zonesInto = movementTackleZones(to, opponents);
    rolls.push({
      type: "dodge",
      target: player.stats.AG,
      modifiers: zonesInto === 0 ? 0 : -zonesInto,
      square: to,
    });
  }
  if (steps > player.stats.MA)
    rolls.push({ type: "rush", target: 2, modifiers: 0, square: to });
  return rolls;
}

export class MovementValidator {
  findPath(input: {
    player: Player;
    targetX: number;
    targetY: number;
    opponents: Player[];
    teammates: Player[];
    movementUsed?: number | undefined;
  }): MovementResult {
    const {
      player,
      targetX,
      targetY,
      opponents,
      teammates,
      movementUsed = 0,
    } = input;
    if (!player.gridPosition) return invalidResult();
    const end = { x: targetX, y: targetY };
    if (
      !inPitchBounds(end) ||
      occupiedSquare(end, [...opponents, ...teammates])
    )
      return invalidResult();
    const start = { x: player.gridPosition.x, y: player.gridPosition.y };
    const search = { start, end, player, opponents, teammates, movementUsed };
    let path = new MovementPathSearch({ ...search, mode: "safe" }).find();
    if (path.length === 0)
      path = new MovementPathSearch({ ...search, mode: "direct" }).find();
    if (path.length === 0) return invalidResult();
    return this.validatePath({
      player,
      path,
      opponents,
      teammates,
      movementUsed,
    });
  }

  findReachableSquares(
    player: Player,
    opponents: Player[],
    teammates: Player[]
  ): ReachableSquare[] {
    const start = player.gridPosition;
    if (!start || !pitchSquare(start)) return [];
    const reachable: ReachableSquare[] = [];
    const maxMovement = moveAllowance(player);
    const width = GameConfig.PITCH_WIDTH;
    const blocked = new Uint8Array(width * GameConfig.PITCH_HEIGHT);
    for (const occupant of [...opponents, ...teammates]) {
      const at = occupant.gridPosition;
      if (at && inPitchBounds(at)) blocked[at.y * width + at.x] = 1;
    }
    blocked[start.y * width + start.x] = 1;
    const queue: ReachableSquare[] = [{ x: start.x, y: start.y, cost: 0 }];
    for (const current of queue) {
      if (current.cost > 0) reachable.push({ ...current });
      if (current.cost < maxMovement) this.flood(current, blocked, queue);
    }
    return reachable;
  }

  private flood(
    current: ReachableSquare,
    blocked: Uint8Array,
    queue: ReachableSquare[]
  ): void {
    const width = GameConfig.PITCH_WIDTH;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = current.x + dx;
        const y = current.y + dy;
        if (!inPitchBounds({ x, y }) || blocked[y * width + x]) continue;
        blocked[y * width + x] = 1;
        queue.push({ x, y, cost: current.cost + 1 });
      }
    }
  }

  validatePath({
    player,
    path,
    opponents,
    teammates = [],
    movementUsed = 0,
  }: PathInput): MovementResult {
    const rolls: MovementRoll[] = [];
    let valid = true;
    let steps =
      movementUsed +
      (player.status === PlayerStatus.PRONE ? standUpCost(player) : 0);
    const occupants = [...opponents, ...teammates];
    for (const { from, to } of adjacentPathSteps(path)) {
      steps++;
      if (!validStep(from, to, occupants) || steps > moveAllowance(player))
        valid = false;
      rolls.push(...stepRolls({ from, to, player, opponents, steps }));
    }
    return { valid, path: path.slice(1), rolls, cost: path.length - 1 };
  }
}
