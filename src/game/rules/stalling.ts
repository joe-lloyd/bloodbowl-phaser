import { GameConfig, isTrapdoorSquare } from "../../config/GameConfig";
import { type GameState } from "../../types/GameState";
import { type Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isInEndZone } from "../elements/GridUtils";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { PrayerToNuffle } from "../../types/Inducements";
import { prayerInPlay } from "../inducements/matchInducements";

const ACTIVATION_ROLLS = [
  SkillType.BONE_HEAD,
  SkillType.REALLY_STUPID,
  SkillType.ANIMAL_SAVAGERY,
  SkillType.UNCHANNELLED_FURY,
  SkillType.TAKE_ROOT,
  SkillType.BLOODLUST,
];

interface Square {
  x: number;
  y: number;
}

function canRunWithBall(
  player: Player,
  ball: Square | null,
  start: Square
): boolean {
  if (!ball || ball.x !== start.x || ball.y !== start.y) return false;
  if (player.status !== PlayerStatus.ACTIVE) return false;
  return !ACTIVATION_ROLLS.some((skill) => hasSkill(player.skills, skill));
}

const onPitch = (square: Square): boolean =>
  square.x >= 0 &&
  square.y >= 0 &&
  square.x < GameConfig.PITCH_WIDTH &&
  square.y < GameConfig.PITCH_HEIGHT;

function neighbours(from: Square): Square[] {
  const squares: Square[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      squares.push({ x: from.x + dx, y: from.y + dy });
    }
  }
  return squares;
}

export function canScoreWithoutDice({
  player,
  state,
  players,
  side,
}: {
  player: Player;
  state: GameState;

  players: Player[];

  side: 1 | 2;
}): boolean {
  const start = player.gridPosition;
  if (!start || !canRunWithBall(player, state.ballPosition, start)) {
    return false;
  }

  const occupied = new Set(
    players
      .filter((p) => p.gridPosition && p.id !== player.id)
      .map((p) => `${String(p.gridPosition!.x)},${String(p.gridPosition!.y)}`)
  );
  const markers = players.filter(
    (p) => p.teamId !== player.teamId && p.gridPosition && hasTackleZone(p)
  );
  const marked = (x: number, y: number) =>
    markers.some(
      (m) =>
        Math.max(
          Math.abs(m.gridPosition!.x - x),
          Math.abs(m.gridPosition!.y - y)
        ) === 1
    );
  const trapdoors = prayerInPlay(state, PrayerToNuffle.TREACHEROUS_TRAPDOOR);
  const seen = new Set([`${String(start.x)},${String(start.y)}`]);
  const blocked = (square: Square, key: string) =>
    seen.has(key) ||
    occupied.has(key) ||
    !onPitch(square) ||
    (trapdoors && isTrapdoorSquare(square.x, square.y));

  const ma = withDriveModifiers(player, state).stats.MA;
  let frontier = marked(start.x, start.y) ? [] : [start];
  for (let step = 1; step <= ma && frontier.length > 0; step++) {
    const next: Square[] = [];
    for (const square of frontier.flatMap(neighbours)) {
      const key = `${String(square.x)},${String(square.y)}`;
      if (blocked(square, key)) continue;
      seen.add(key);
      if (isInEndZone(square, GameConfig.PITCH_WIDTH, side)) return true;
      if (!marked(square.x, square.y)) next.push(square);
    }
    frontier = next;
  }
  return false;
}

export function crowdHits(roll: number, turnNumber: number): boolean {
  return roll >= turnNumber;
}
