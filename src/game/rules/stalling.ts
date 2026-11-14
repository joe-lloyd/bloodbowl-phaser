/**
 * Stalling (2025 rulebook p.80): "Should a player be in possession of the
 * ball when they are activated, can score a Touchdown without having to roll
 * any dice, yet finishes their activation without having scored a
 * Touchdown then they are said to be Stalling." Needing to Dodge, Rush,
 * Block, or roll for a Trait such as Bone Head when activated means the
 * player could not score without dice.
 *
 * The Crowd Takes Action at the end of a Stalling player's activation: a D6
 * equal to or higher than the team's current Turn number Knocks them Down.
 */

import { GameConfig, isTrapdoorSquare } from "../../config/GameConfig";
import { GameState } from "../../types/GameState";
import { Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isInEndZone } from "../elements/GridUtils";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { PrayerToNuffle } from "../../types/Inducements";
import { prayerInPlay } from "../inducements/matchInducements";

/** Traits that roll a D6 the moment their player is activated. */
const ACTIVATION_ROLLS = [
  SkillType.BONE_HEAD,
  SkillType.REALLY_STUPID,
  SkillType.ANIMAL_SAVAGERY,
  SkillType.UNCHANNELLED_FURY,
  SkillType.TAKE_ROOT,
  SkillType.BLOODLUST,
];

/**
 * Whether `player` holds the ball and could walk it into their End Zone
 * this activation without rolling any dice: Standing, no roll when
 * activated, and a path of empty squares within MA that never leaves an
 * opposition Tackle Zone. Entering a marked square is free; leaving one is
 * a Dodge. An open Treacherous Trapdoor is a roll to enter.
 */
export function canScoreWithoutDice({
  player,
  state,
  players,
  side,
}: {
  player: Player;
  state: GameState;
  /** Everyone on the pitch, both teams. */
  players: Player[];
  /** The End Zone the player scores in (see isInEndZone). */
  side: 1 | 2;
}): boolean {
  const start = player.gridPosition;
  const ball = state.ballPosition;
  if (!start || !ball || ball.x !== start.x || ball.y !== start.y) {
    return false;
  }
  if (player.status !== PlayerStatus.ACTIVE) return false;
  if (ACTIVATION_ROLLS.some((skill) => hasSkill(player.skills, skill))) {
    return false;
  }

  const occupied = new Set(
    players
      .filter((p) => p.gridPosition && p.id !== player.id)
      .map((p) => `${p.gridPosition!.x},${p.gridPosition!.y}`)
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

  // Breadth-first over the squares the player can leave without a Dodge
  const ma = withDriveModifiers(player, state).stats.MA;
  let frontier = marked(start.x, start.y) ? [] : [start];
  const seen = new Set([`${start.x},${start.y}`]);
  for (let step = 1; step <= ma && frontier.length > 0; step++) {
    const next: { x: number; y: number }[] = [];
    for (const from of frontier) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const square = { x: from.x + dx, y: from.y + dy };
          const key = `${square.x},${square.y}`;
          if (
            seen.has(key) ||
            occupied.has(key) ||
            square.x < 0 ||
            square.y < 0 ||
            square.x >= GameConfig.PITCH_WIDTH ||
            square.y >= GameConfig.PITCH_HEIGHT ||
            (trapdoors && isTrapdoorSquare(square.x, square.y))
          ) {
            continue;
          }
          seen.add(key);
          if (isInEndZone(square, GameConfig.PITCH_WIDTH, side)) return true;
          if (!marked(square.x, square.y)) next.push(square);
        }
      }
    }
    frontier = next;
  }
  return false;
}

/** The crowd hits on a D6 equal to or higher than the team's Turn number. */
export function crowdHits(roll: number, turnNumber: number): boolean {
  return roll >= turnNumber;
}
