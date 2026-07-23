/**
 * Which actions a selected, activatable player can meaningfully declare
 * right now — used to drive a contextual action menu instead of showing
 * every action unconditionally. Pure and Phaser-free: it takes plain board
 * data (the player, the ball, the two player lists, and the squares the
 * player can reach) so it is unit-testable and shared by any front end.
 *
 * "Reachable-adjacent" means the player could END their move on a square
 * adjacent to the target (so Blitz/Foul/Hand-off, which move first, are
 * offered when a legal end square exists). The special actions target an
 * already-adjacent Standing opponent (no pre-move in this first cut), so
 * they use plain adjacency.
 */

import { Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isRightStuffEligible } from "./throwTeammate";
import { jumpTargets } from "./jump";
import { GameConfig } from "../../config/GameConfig";

export interface TurnFlags {
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;
}

export interface ActionAvailabilityInput {
  player: Player;
  ballPosition: { x: number; y: number } | null;
  /** On-pitch opponents. */
  opponents: Player[];
  /** On-pitch team-mates (excluding the player). */
  teammates: Player[];
  /** Squares the player can reach this activation (getAvailableMovements). */
  reachable: { x: number; y: number; cost?: number }[];
  turn: TurnFlags;
  /** The player already moved this activation (blocks move-first actions). */
  hasMovedInAction: boolean;
}

export interface ActionAvailability {
  move: boolean;
  /** A Block without moving — an adjacent Standing opponent, not yet moved. */
  block: boolean;
  /** A Jump over an adjacent downed player (or any square with Leap/Pogo). */
  jump: boolean;
  blitz: boolean;
  pass: boolean;
  handoff: boolean;
  foul: boolean;
  standUp: boolean;
  secureBall: boolean;
  stab: boolean;
  breatheFire: boolean;
  vomit: boolean;
  gaze: boolean;
  chomp: boolean;
  throwTeammate: boolean;
  kickTeammate: boolean;
}

const chebyshev = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const isStanding = (p: Player): boolean => p.status === PlayerStatus.ACTIVE;
const isDown = (p: Player): boolean =>
  p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;

export function computeActionAvailability(
  input: ActionAvailabilityInput
): ActionAvailability {
  const { player, ballPosition, opponents, teammates, reachable, turn } = input;
  const here = player.gridPosition;
  const none: ActionAvailability = {
    move: false,
    block: false,
    jump: false,
    blitz: false,
    pass: false,
    handoff: false,
    foul: false,
    standUp: false,
    secureBall: false,
    stab: false,
    breatheFire: false,
    vomit: false,
    gaze: false,
    chomp: false,
    throwTeammate: false,
    kickTeammate: false,
  };
  if (!here) return none;

  const isProne = player.status === PlayerStatus.PRONE;
  const canAct = !player.hasActed && player.status !== PlayerStatus.STUNNED;
  if (!canAct) return { ...none, standUp: false };

  // Squares the player could be standing on when they act — every reachable
  // square plus the one they occupy now (acting without moving).
  const endSquares = [here, ...reachable];
  const canEndAdjacentTo = (target: { x: number; y: number }): boolean =>
    endSquares.some((s) => chebyshev(s, target) === 1);

  const onPitch = (p: Player) => !!p.gridPosition;
  const standingEnemies = opponents.filter((o) => onPitch(o) && isStanding(o));
  const downEnemies = opponents.filter((o) => onPitch(o) && isDown(o));
  const standingMates = teammates.filter((t) => onPitch(t) && isStanding(t));

  const holdsBall =
    !!ballPosition && ballPosition.x === here.x && ballPosition.y === here.y;
  const ballReachable =
    !!ballPosition &&
    reachable.some((s) => s.x === ballPosition.x && s.y === ballPosition.y);
  const canHaveBall = holdsBall || ballReachable;

  // A move-first action needs a legal end square adjacent to a valid target.
  const blitz =
    !turn.hasBlitzed &&
    !input.hasMovedInAction &&
    standingEnemies.some((e) => canEndAdjacentTo(e.gridPosition!));
  const foul =
    !turn.hasFouled &&
    !input.hasMovedInAction &&
    downEnemies.some((e) => canEndAdjacentTo(e.gridPosition!));
  const pass = !turn.hasPassed && !input.hasMovedInAction && canHaveBall;
  const handoff =
    !turn.hasHandedOff &&
    !input.hasMovedInAction &&
    canHaveBall &&
    standingMates.some((t) => canEndAdjacentTo(t.gridPosition!));

  // Special actions target an already-adjacent Standing opponent.
  const adjacentStandingEnemy = standingEnemies.some(
    (e) => chebyshev(here, e.gridPosition!) === 1
  );

  // A standalone Block: adjacent to a Standing opponent and not yet moved
  // (once moved, a Block needs a Blitz). The auto-block on clicking an
  // adjacent enemy still works; this just surfaces it as a menu button.
  const block = adjacentStandingEnemy && !input.hasMovedInAction;

  // Jump: over an adjacent player (Prone/Stunned by default, any with
  // Leap/Pogo) into one of their unoccupied push-back squares.
  const canJumpAnything =
    hasSkill(player.skills, SkillType.LEAP) ||
    hasSkill(player.skills, SkillType.POGO);
  const inBounds = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < GameConfig.PITCH_WIDTH &&
    y < GameConfig.PITCH_HEIGHT;
  const jump =
    isStanding(player) &&
    jumpTargets(
      here,
      [...opponents, ...teammates].filter(onPitch),
      canJumpAnything,
      inBounds
    ).length > 0;
  const special = (type: SkillType) =>
    hasSkill(player.skills, type) && adjacentStandingEnemy;

  // Throw / Kick Team-mate: an adjacent Standing team-mate that is Right-Stuff
  // eligible (has the trait and Strength 3 or less) is a legal target.
  const adjacentEligibleMate = standingMates.some(
    (t) =>
      chebyshev(here, t.gridPosition!) === 1 && isRightStuffEligible(t)
  );
  const throwTeammate =
    hasSkill(player.skills, SkillType.THROW_TEAM_MATE) && adjacentEligibleMate;
  const kickTeammate =
    hasSkill(player.skills, SkillType.KICK_TEAM_MATE) && adjacentEligibleMate;

  return {
    move: true,
    block,
    jump,
    blitz,
    pass,
    handoff,
    foul,
    standUp: isProne,
    secureBall: ballReachable && !holdsBall,
    stab: special(SkillType.STAB),
    breatheFire: special(SkillType.BREATHE_FIRE),
    vomit: special(SkillType.PROJECTILE_VOMIT),
    gaze: special(SkillType.HYPNOTIC_GAZE),
    chomp: special(SkillType.MONSTROUS_MOUTH),
    throwTeammate,
    kickTeammate,
  };
}
