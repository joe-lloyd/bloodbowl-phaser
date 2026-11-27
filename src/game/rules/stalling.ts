import { isTrapdoorSquare } from "../../config/GameConfig";
import { type GameState } from "../../types/GameState";
import { type Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type Frame, scoresAt } from "./frames";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { PrayerToNuffle } from "../../types/Inducements";
import { prayerInPlay } from "../inducements/matchInducements";
import { type StallingPenalty } from "../variants/gameTypeRules";
import { isStandableSquare } from "./pitchSquares";
import { restrainedByHerder } from "../skills/rules/SquigRageRule";

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

function canRunWithBall({
  player,
  players,
  ball,
  start,
}: {
  player: Player;
  players: Player[];
  ball: Square | null;
  start: Square;
}): boolean {
  if (!ball || ball.x !== start.x || ball.y !== start.y) return false;
  if (player.status !== PlayerStatus.ACTIVE) return false;
  if (ACTIVATION_ROLLS.some((skill) => hasSkill(player.skills, skill)))
    return false;
  return (
    !hasSkill(player.skills, SkillType.SQUIG_RAGE) ||
    restrainedByHerder(
      player,
      players.filter((mate) => mate.teamId === player.teamId)
    )
  );
}

const onPitch = (square: Square): boolean => isStandableSquare(square);

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
  frame,
}: {
  player: Player;
  state: GameState;

  players: Player[];

  frame: Frame;
}): boolean {
  const start = player.gridPosition;
  if (
    !start ||
    !canRunWithBall({ player, players, ball: state.ballPosition, start })
  ) {
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
    const reachable = frontier.flatMap((square) => neighbours(square));
    for (const square of reachable) {
      const key = `${String(square.x)},${String(square.y)}`;
      if (blocked(square, key)) continue;
      seen.add(key);
      if (scoresAt(frame, square)) return true;
      if (!marked(square.x, square.y)) next.push(square);
    }
    frontier = next;
  }
  return false;
}

const BOTTLE_HITS_ON = 2;

export function stallingHitsOn(
  penalty: StallingPenalty,
  turnNumber: number
): number {
  return penalty === "bottle" ? BOTTLE_HITS_ON : turnNumber;
}
