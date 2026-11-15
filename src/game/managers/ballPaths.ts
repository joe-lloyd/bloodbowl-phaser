import { GameConfig } from "../../config/GameConfig";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { Team } from "@/types/Team";

type Square = { x: number; y: number };

const MAX_X = GameConfig.PITCH_WIDTH - 1;
const MAX_Y = GameConfig.PITCH_HEIGHT - 1;

const distance = (a: Square, b: Square): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const isOffPitch = (p: Square): boolean =>
  p.x < 0 || p.x > MAX_X || p.y < 0 || p.y > MAX_Y;

/** The three infield throw-in directions for the edge the ball left from. */
export function throwInDirections(from: Square): Square[] {
  if (from.x <= 0)
    return [
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
  if (from.x >= MAX_X)
    return [
      { x: -1, y: -1 },
      { x: -1, y: 0 },
      { x: -1, y: 1 },
    ];
  if (from.y <= 0)
    return [
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
  return [
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
  ];
}

/** The last on-pitch square a throw-in passes before leaving again. */
export function lastSquareIn(from: Square, dir: Square, steps: number): Square {
  let lastIn = { ...from };
  for (let s = 1; s <= steps; s++) {
    const p = { x: from.x + dir.x * s, y: from.y + dir.y * s };
    if (isOffPitch(p)) break;
    lastIn = p;
  }
  return lastIn;
}

/** An Open player: on the pitch, and no Standing opponent next to them. */
function isMarkedAt(square: Square, opponents: Team): boolean {
  return opponents.players.some(
    (opponent) =>
      opponent.status === PlayerStatus.ACTIVE &&
      !!opponent.gridPosition &&
      distance(opponent.gridPosition, square) === 1
  );
}

/**
 * The receiving player who may use On the Ball before the Kick-off Event:
 * the topmost, then leftmost, Open Standing player with the skill.
 */
export function kickoffOnTheBallReactor(
  receiving: Team,
  opponents: Team
): Player | undefined {
  return receiving.players
    .filter(
      (player) =>
        player.status === PlayerStatus.ACTIVE &&
        hasSkill(player.skills ?? [], SkillType.ON_THE_BALL) &&
        !!player.gridPosition &&
        !isMarkedAt(player.gridPosition, opponents)
    )
    .sort(
      (a, b) =>
        a.gridPosition!.y - b.gridPosition!.y ||
        a.gridPosition!.x - b.gridPosition!.x
    )[0];
}

/**
 * The next square of a kick-off On the Ball move: free, unmarked, in the
 * receiving half, nearest the ball, then topmost, then leftmost.
 */
export function kickoffOnTheBallStep(
  current: Square,
  move: {
    occupied: Set<string>;
    opponents: Team;
    isTeam1Kicking: boolean;
    ball: Square;
  }
): Square | undefined {
  const { occupied, opponents, isTeam1Kicking, ball } = move;
  const candidates: Square[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const square = { x: current.x + dx, y: current.y + dy };
      const staysOwnHalf = isTeam1Kicking
        ? square.x >= GameConfig.PITCH_WIDTH / 2
        : square.x < GameConfig.PITCH_WIDTH / 2;
      if (
        (dx !== 0 || dy !== 0) &&
        !isOffPitch(square) &&
        staysOwnHalf &&
        !isMarkedAt(square, opponents) &&
        !occupied.has(`${square.x},${square.y}`)
      ) {
        candidates.push(square);
      }
    }
  }
  candidates.sort(
    (a, b) => distance(a, ball) - distance(b, ball) || a.y - b.y || a.x - b.x
  );
  return candidates[0];
}
