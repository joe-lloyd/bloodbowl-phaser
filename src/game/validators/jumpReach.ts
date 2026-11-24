import { type Player, PlayerStatus } from "../../types/Player";
import { GameConfig } from "../../config/GameConfig";
import { JUMP_COST, legalJumpTargets, mayJumpAnything } from "../rules/jump";
import { moveAllowance } from "../skills/movement";
import { movementNeighbors, type MovementSquare } from "./movementSquares";

export type MoveReach = "walk" | "jump";

export type ReachableSquare = MovementSquare & { cost: number };

interface JumpSearch {
  player: Player;
  start: MovementSquare;
  others: Player[];
}

const keyOf = ({ x, y }: MovementSquare) => y * GameConfig.PITCH_WIDTH + x;

function squaresOf(players: Player[]): MovementSquare[] {
  return players.flatMap((p) => (p.gridPosition ? [p.gridPosition] : []));
}

function takeoffFilter({ player, others }: JumpSearch) {
  if (mayJumpAnything(player)) return () => true;
  const downed = others.filter((p) => p.status !== PlayerStatus.ACTIVE);
  const beside = new Set(
    squaresOf(downed).flatMap((at) => movementNeighbors(at).map(keyOf))
  );
  return (square: MovementSquare) => beside.has(keyOf(square));
}

function stepsFrom(search: JumpSearch): (at: ReachableSquare) => ReachableSquare[] {
  const { player, others } = search;
  const blocked = new Set(squaresOf(others).map(keyOf));
  const maySpring = takeoffFilter(search);
  return (at) => {
    const walks = movementNeighbors(at)
      .filter((square) => !blocked.has(keyOf(square)))
      .map((square) => ({ ...square, cost: at.cost + 1 }));
    const jumps = maySpring(at)
      ? legalJumpTargets(player, at, others).map(({ dest }) => ({
          ...dest,
          cost: at.cost + JUMP_COST,
        }))
      : [];
    return [...walks, ...jumps];
  };
}

export function reachWithJumps(search: JumpSearch): ReachableSquare[] {
  const allowance = moveAllowance(search.player);
  const onward = stepsFrom(search);
  const best = new Map<number, ReachableSquare>();
  const start = { ...search.start, cost: 0 };
  best.set(keyOf(start), start);
  const frontier: ReachableSquare[][] = [[start]];
  for (let cost = 0; cost < allowance; cost++) {
    const current = frontier[cost] ?? [];
    for (const next of current
      .filter((at) => best.get(keyOf(at)) === at)
      .flatMap(onward)) {
      const known = best.get(keyOf(next));
      if (next.cost > allowance || (known && known.cost <= next.cost)) continue;
      best.set(keyOf(next), next);
      (frontier[next.cost] ??= []).push(next);
    }
  }
  best.delete(keyOf(start));
  return [...best.values()];
}
