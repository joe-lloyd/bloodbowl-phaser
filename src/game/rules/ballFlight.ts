import type { DiceController } from "../controllers/DiceController";
import { isKickingTeamTerritory } from "../../config/GameConfig";
import { activeLayout } from "../variants/activeMatch";
import type { Square } from "../variants/pitchLayouts";
import {
  edgeCrossed,
  isOnPitch,
  isStandableSquare,
  obstacleKindAt,
} from "./pitchSquares";

type FlightDice = Pick<DiceController, "rollD6" | "rollD8">;

const D8_OFFSETS: Readonly<Record<number, Square>> = {
  1: { x: -1, y: -1 },
  2: { x: 0, y: -1 },
  3: { x: 1, y: -1 },
  4: { x: -1, y: 0 },
  5: { x: 1, y: 0 },
  6: { x: -1, y: 1 },
  7: { x: 0, y: 1 },
  8: { x: 1, y: 1 },
};

export function d8Offset(roll: number): Square {
  const offset = D8_OFFSETS[roll];
  if (!offset) throw new Error(`No direction for D8 roll ${String(roll)}`);
  return offset;
}

const step = (from: Square, dir: Square, times: number): Square => ({
  x: from.x + dir.x * times,
  y: from.y + dir.y * times,
});

export function lastSquareIn(from: Square, dir: Square, steps: number): Square {
  let lastIn = { ...from };
  for (let s = 1; s <= steps; s++) {
    const next = step(from, dir, s);
    if (!isOnPitch(next)) break;
    lastIn = next;
  }
  return lastIn;
}

function wallBeside(from: Square): Square | undefined {
  const { cols, rows, walledSidelines } = activeLayout();
  if (!walledSidelines || from.x <= 0 || from.x >= cols - 1) return undefined;
  if (from.y <= 0) return { x: from.x, y: -1 };
  return from.y >= rows - 1 ? { x: from.x, y: rows } : undefined;
}

export function leavesByWall(
  from: Square,
  toward?: Square
): Square | undefined {
  if (!toward) return wallBeside(from);
  return edgeCrossed(toward) === "sideline-wall" ? toward : undefined;
}

function awayFromWall(wall: Square): Square[] {
  const dy = wall.y < 0 ? 1 : -1;
  return [
    { x: -1, y: dy },
    { x: 0, y: dy },
    { x: 1, y: dy },
  ];
}

export interface WallHit {
  from: Square;
  wall: Square;
  to: Square;
  distance: number;
}

export type RicochetFlight =
  | { kind: "landed"; landing: Square; hits: WallHit[] }
  | { kind: "crowd"; lastIn: Square; hits: WallHit[] };

const MAX_RICOCHETS = 12;

export function ricochetFlight(
  dice: FlightDice,
  from: Square,
  wall: Square
): RicochetFlight {
  const hits: WallHit[] = [];
  let at = from;
  let hitWall = wall;
  for (let bounce = 0; bounce < MAX_RICOCHETS; bounce++) {
    const roll = dice.rollD6("Wall Ricochet Direction");
    const dir = awayFromWall(hitWall)[Math.floor((roll - 1) / 2)];
    if (!dir) throw new Error(`No ricochet direction for roll ${String(roll)}`);
    const distance = dice.rollD6("Wall Ricochet Distance");
    const target = step(at, dir, distance - 1);
    const lastIn = lastSquareIn(at, dir, distance - 1);
    hits.push({ from: at, wall: hitWall, to: lastIn, distance });
    if (isOnPitch(target)) return { kind: "landed", landing: target, hits };
    const exit = step(lastIn, dir, 1);
    if (edgeCrossed(exit) === "crowd") return { kind: "crowd", lastIn, hits };
    at = lastIn;
    hitWall = exit;
  }
  return { kind: "landed", landing: at, hits };
}

function firstClearSquare(from: Square, dir: Square): Square | undefined {
  for (let s = 1; ; s++) {
    const next = step(from, dir, s);
    if (!isOnPitch(next)) return undefined;
    if (isStandableSquare(next)) return next;
  }
}

const MAX_OBSTACLE_ROLLS = 24;

export function settleOffObstacle(dice: FlightDice, square: Square): Square {
  if (obstacleKindAt(square) === undefined) return square;
  for (let roll = 0; roll < MAX_OBSTACLE_ROLLS; roll++) {
    const dir = d8Offset(dice.rollD8("Ball Rolls Off the Obstacle"));
    const clear = firstClearSquare(square, dir);
    if (clear) return clear;
  }
  return square;
}

export interface KickLanding {
  landing: Square | null;
  wallHits: WallHit[];
}

export function settleKick(
  dice: FlightDice,
  flight: { lastIn: Square; to: Square },
  isTeam1Kicking: boolean
): KickLanding {
  let landing = flight.to;
  let wallHits: WallHit[] = [];
  if (!isOnPitch(landing)) {
    const wall = step(flight.lastIn, unitToward(flight.lastIn, landing), 1);
    if (edgeCrossed(wall) === "crowd") return { landing: null, wallHits };
    const ricochet = ricochetFlight(dice, flight.lastIn, wall);
    wallHits = ricochet.hits;
    if (ricochet.kind === "crowd") return { landing: null, wallHits };
    landing = ricochet.landing;
  }
  landing = settleOffObstacle(dice, landing);
  const touchback = isKickingTeamTerritory(landing.x, isTeam1Kicking);
  return { landing: touchback ? null : landing, wallHits };
}

function unitToward(from: Square, to: Square): Square {
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

export function lastSquareOnLine(from: Square, to: Square): Square {
  const dir = unitToward(from, to);
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return lastSquareIn(from, dir, steps);
}
