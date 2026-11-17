/**
 * Which actions a selected, activatable player can meaningfully declare
 * right now — used to drive a contextual action menu instead of showing
 * every action unconditionally. Pure and Phaser-free: it takes plain board
 * data (the player, the ball, the two player lists, and the squares the
 * player can reach) so it is unit-testable and shared by any front end.
 *
 * "Reachable-adjacent" means the player could END their move on a square
 * adjacent to the target (so Blitz/Foul/Hand-off, which move first, are
 * offered when a legal end square exists). Hypnotic Gaze and Punt also move
 * first, and a Prone player may declare them (errata p.122); the other
 * special actions target an already-adjacent Standing opponent.
 */

import {
  Player,
  PlayerCondition,
  PlayerStatus,
  hasCondition,
  hasTackleZone,
} from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isRightStuffEligible } from "./throwTeammate";
import { jumpTargets } from "./jump";
import { canSecureBall } from "./secureBall";
import { GameConfig } from "../../config/GameConfig";
import {
  BlockReplacement,
  BLOCK_REPLACEMENTS,
} from "../../types/BlockReplacement";
import {
  hasReachableBlockReplacementTarget,
  legalBlockReplacementTargets,
} from "./blockReplacements";
import { ActionType } from "../../types/events";

/**
 * The Actions that include a Move Action: each lets the player move first
 * (2025 rulebook pp.54-55, and the Punt and Hypnotic Gaze Special Actions).
 */
const ACTIONS_WITH_A_MOVE: ReadonlySet<ActionType> = new Set<ActionType>([
  "move",
  "blitz",
  "pass",
  "handoff",
  "foul",
  "secureBall",
  "throwTeamMate",
  "punt",
  "gaze",
  "ballAndChain",
]);

/**
 * Razzle-Dazzle (Spike! Journal 22, L22): the second of a player's two
 * Actions may not be the first again, and the two may not both contain a
 * Move Action.
 */
export function razzleDazzleAllows(
  first: ActionType,
  second: ActionType
): boolean {
  return (
    first !== second &&
    !(ACTIONS_WITH_A_MOVE.has(first) && ACTIONS_WITH_A_MOVE.has(second))
  );
}

export interface TurnFlags {
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;
  /** Each is once per Turn (p.55, p.131). */
  hasThrownTeamMate: boolean;
  hasKickedTeamMate: boolean;
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
  /**
   * Razzle-Dazzle: the player's first Action has ended and this is the one
   * it was. The menu then offers the second Action, from where they stand.
   */
  secondActionAfter?: ActionType;
}

export interface ActionAvailability {
  move: boolean;
  /** A Block without moving — an adjacent Standing opponent, not yet moved. */
  block: boolean;
  multipleBlock: boolean;
  /** A Jump over an adjacent downed player (or any square with Leap/Pogo). */
  jump: boolean;
  blitz: boolean;
  pass: boolean;
  punt: boolean;
  handoff: boolean;
  foul: boolean;
  standUp: boolean;
  secureBall: boolean;
  stab: boolean;
  breatheFire: boolean;
  vomit: boolean;
  gaze: boolean;
  chomp: boolean;
  chainsaw: boolean;
  throwTeammate: boolean;
  kickTeammate: boolean;
  /** A Throw Bomb Special Action — has Bombardier and has not moved yet. */
  throwBomb: boolean;
  /** A Ball & Chain Special Action — the only action a Fanatic may declare. */
  ballAndChain: boolean;
  /** Direct declarations with a legal target on the current square. */
  directBlockReplacements: BlockReplacement[];
  /** Labelled Blitz declarations that can reach a legal target. */
  blitzBlockReplacements: BlockReplacement[];
}

const chebyshev = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const isStanding = (p: Player): boolean => p.status === PlayerStatus.ACTIVE;
const isDown = (p: Player): boolean =>
  p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;

type GatedKey = Exclude<
  keyof ActionAvailability,
  "standUp" | "directBlockReplacements" | "blitzBlockReplacements"
>;

/** The Action each menu entry counts as for the Razzle-Dazzle limits. */
const SECOND_ACTION_TYPE: Record<GatedKey, ActionType> = {
  move: "move",
  block: "block",
  multipleBlock: "multipleBlock",
  jump: "move",
  blitz: "blitz",
  pass: "pass",
  punt: "punt",
  handoff: "handoff",
  foul: "foul",
  secureBall: "secureBall",
  stab: "stab",
  breatheFire: "breatheFire",
  vomit: "vomit",
  gaze: "gaze",
  chomp: "chomp",
  chainsaw: "chainsaw",
  throwTeammate: "throwTeamMate",
  kickTeammate: "throwTeamMate",
  throwBomb: "throwBomb",
  ballAndChain: "ballAndChain",
};

function secondActionAvailability(
  input: ActionAvailabilityInput,
  first: ActionType
): ActionAvailability {
  // The second Action starts afresh: moving in the first one does not
  // stop a Block, only the Razzle-Dazzle limits do.
  const all = computeActionAvailability({
    ...input,
    hasMovedInAction: false,
    secondActionAfter: undefined,
  });
  const allows = (action: ActionType) => razzleDazzleAllows(first, action);
  const gate = (key: GatedKey) => all[key] && allows(SECOND_ACTION_TYPE[key]);
  return {
    move: gate("move"),
    block: gate("block"),
    multipleBlock: gate("multipleBlock"),
    jump: gate("jump"),
    blitz: gate("blitz"),
    pass: gate("pass"),
    punt: gate("punt"),
    handoff: gate("handoff"),
    foul: gate("foul"),
    standUp: false,
    secureBall: gate("secureBall"),
    stab: gate("stab"),
    breatheFire: gate("breatheFire"),
    vomit: gate("vomit"),
    gaze: gate("gaze"),
    chomp: gate("chomp"),
    chainsaw: gate("chainsaw"),
    throwTeammate: gate("throwTeammate"),
    kickTeammate: gate("kickTeammate"),
    throwBomb: gate("throwBomb"),
    ballAndChain: gate("ballAndChain"),
    directBlockReplacements: all.directBlockReplacements.filter((r) =>
      allows(r)
    ),
    blitzBlockReplacements: allows("blitz") ? all.blitzBlockReplacements : [],
  };
}

const none = (): ActionAvailability => ({
  move: false,
  block: false,
  multipleBlock: false,
  jump: false,
  blitz: false,
  pass: false,
  punt: false,
  handoff: false,
  foul: false,
  standUp: false,
  secureBall: false,
  stab: false,
  breatheFire: false,
  vomit: false,
  gaze: false,
  chomp: false,
  chainsaw: false,
  throwTeammate: false,
  kickTeammate: false,
  throwBomb: false,
  ballAndChain: false,
  directBlockReplacements: [],
  blitzBlockReplacements: [],
});

type Square = { x: number; y: number };

/** The board as seen by a player who can act, standing on `here`. */
interface ActingBoard {
  input: ActionAvailabilityInput;
  here: Square;
  standingEnemies: Player[];
  downEnemies: Player[];
  standingMates: Player[];
  handoffEligibleMates: Player[];
  ballReachable: boolean;
  canHaveBall: boolean;
  canEndAdjacentTo: (target: Square) => boolean;
}

const onPitch = (p: Player) => !!p.gridPosition;

function actingBoard(
  input: ActionAvailabilityInput,
  here: Square
): ActingBoard {
  const { ballPosition, opponents, teammates, reachable } = input;
  // Squares the player could be standing on when they act — every reachable
  // square plus the one they occupy now (acting without moving).
  const endSquares = [here, ...reachable];
  const holdsBall =
    !!ballPosition && ballPosition.x === here.x && ballPosition.y === here.y;
  const ballReachable =
    !!ballPosition &&
    reachable.some((s) => s.x === ballPosition.x && s.y === ballPosition.y);
  return {
    input,
    here,
    standingEnemies: opponents.filter((o) => onPitch(o) && isStanding(o)),
    downEnemies: opponents.filter((o) => onPitch(o) && isDown(o)),
    standingMates: teammates.filter((t) => onPitch(t) && isStanding(t)),
    // A Hand-off target must be Standing AND still hold its Tackle Zone — a
    // Distracted team-mate is "Standing" (isStanding above) but is not a legal
    // target, so this is a narrower list than standingMates.
    handoffEligibleMates: teammates.filter(
      (t) => onPitch(t) && hasTackleZone(t)
    ),
    ballReachable,
    canHaveBall: holdsBall || ballReachable,
    canEndAdjacentTo: (target) =>
      endSquares.some((s) => chebyshev(s, target) === 1),
  };
}

/** Blitz, Foul, Pass and Hand-off: each moves first, then acts. */
function moveFirstActions(board: ActingBoard) {
  const { input, canEndAdjacentTo, canHaveBall } = board;
  const { player, turn } = input;
  const fresh = !input.hasMovedInAction;
  // A move-first action needs a legal end square adjacent to a valid target.
  const blitz =
    !turn.hasBlitzed &&
    fresh &&
    board.standingEnemies.some((e) => canEndAdjacentTo(e.gridPosition!));
  const foul =
    !turn.hasFouled &&
    fresh &&
    board.downEnemies.some((e) => canEndAdjacentTo(e.gridPosition!));
  // My Ball: "may not declare Pass Actions, Hand-off Actions" (2025 p.132).
  const myBall = hasSkill(player.skills, SkillType.MY_BALL);
  const pass = !myBall && !turn.hasPassed && fresh && canHaveBall;
  // Reachability form: a legal final square exists that is adjacent to a
  // Standing, Tackle-Zone-holding team-mate. Possession is not required to
  // declare — canHaveBall already covers "reachable within movement".
  const handoff =
    !myBall &&
    !turn.hasHandedOff &&
    fresh &&
    canHaveBall &&
    board.handoffEligibleMates.some((t) => canEndAdjacentTo(t.gridPosition!));
  return { blitz, foul, pass, handoff };
}

/** Block, Multiple Block and Jump: from the square the player is on. */
function standingStillActions(board: ActingBoard) {
  const { input, here } = board;
  const { player, opponents, teammates } = input;
  const adjacentEnemies = board.standingEnemies.filter(
    (e) => chebyshev(here, e.gridPosition!) === 1
  );
  // A standalone Block: adjacent to a Standing opponent and not yet moved
  // (once moved, a Block needs a Blitz). The auto-block on clicking an
  // adjacent enemy still works; this just surfaces it as a menu button.
  // A Prone player may only declare it with Jump Up (2025 p.130), which
  // gates standing up on an Agility test — everyone else must Blitz.
  const block =
    adjacentEnemies.length > 0 &&
    !input.hasMovedInAction &&
    (isStanding(player) || hasSkill(player.skills, SkillType.JUMP_UP));
  const multipleBlock =
    !input.hasMovedInAction &&
    hasSkill(player.skills, SkillType.MULTIPLE_BLOCK) &&
    adjacentEnemies.length >= 2;

  // Jump: over an adjacent player (Prone/Stunned by default, any with
  // Leap/Pogo) into one of their unoccupied push-back squares.
  const canJumpAnything =
    hasSkill(player.skills, SkillType.LEAP) ||
    hasSkill(player.skills, SkillType.POGO);
  const jump =
    isStanding(player) &&
    jumpTargets(
      here,
      [...opponents, ...teammates].filter(onPitch),
      canJumpAnything,
      inBounds
    ).length > 0;
  return { block, multipleBlock, jump };
}

const inBounds = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < GameConfig.PITCH_WIDTH && y < GameConfig.PITCH_HEIGHT;

/** Direct and Blitz block-replacing Special Actions with a legal target. */
function blockReplacementActions(board: ActingBoard) {
  const { player, opponents, reachable, turn } = board.input;
  const fresh = !board.input.hasMovedInAction;
  // A direct block-replacing Special Action is a no-move declaration, exactly
  // like a standalone Block: once the activation has spent movement, the only
  // way to attack is the Blitz variant (declared before moving).
  const directBlockReplacements =
    player.status === PlayerStatus.ACTIVE && fresh
      ? BLOCK_REPLACEMENTS.filter(
          (replacement) =>
            legalBlockReplacementTargets(player, opponents, replacement)
              .length > 0
        )
      : [];
  const blitzBlockReplacements =
    !turn.hasBlitzed && fresh
      ? BLOCK_REPLACEMENTS.filter((replacement) =>
          hasReachableBlockReplacementTarget(
            player,
            opponents,
            reachable,
            replacement
          )
        )
      : [];
  return { directBlockReplacements, blitzBlockReplacements };
}

/** Gaze, Throw and Kick Team-mate, Throw Bomb and Punt. */
function skillActions(board: ActingBoard) {
  const { input, here, canHaveBall } = board;
  const { player } = input;
  const gaze =
    hasSkill(player.skills, SkillType.HYPNOTIC_GAZE) &&
    board.standingEnemies.some((e) => board.canEndAdjacentTo(e.gridPosition!));
  // Throw / Kick Team-mate: an adjacent Standing team-mate that is Right-Stuff
  // eligible (has the trait and Strength 3 or less) is a legal target.
  const adjacentEligibleMate = board.standingMates.some(
    (t) => chebyshev(here, t.gridPosition!) === 1 && isRightStuffEligible(t)
  );
  const throwTeammate =
    hasSkill(player.skills, SkillType.THROW_TEAM_MATE) &&
    !input.turn.hasThrownTeamMate &&
    adjacentEligibleMate;
  const kickTeammate =
    hasSkill(player.skills, SkillType.KICK_TEAM_MATE) &&
    !input.turn.hasKickedTeamMate &&
    adjacentEligibleMate;

  // Throw Bomb: like a Pass, it may not follow a Move, and targets any square.
  const throwBomb =
    hasSkill(player.skills, SkillType.BOMBARDIER) &&
    isStanding(player) &&
    !input.hasMovedInAction;
  const punt =
    hasSkill(player.skills, SkillType.PUNT) &&
    (isStanding(player) || player.status === PlayerStatus.PRONE) &&
    canHaveBall;
  return { gaze, throwTeammate, kickTeammate, throwBomb, punt };
}

export function computeActionAvailability(
  input: ActionAvailabilityInput
): ActionAvailability {
  const first = input.secondActionAfter;
  if (first) return secondActionAvailability(input, first);
  const { player, ballPosition, opponents, teammates } = input;
  const here = player.gridPosition;
  if (!here) return none();

  const canAct = !player.hasActed && player.status !== PlayerStatus.STUNNED;
  if (!canAct) return { ...none(), standUp: false };

  // Ball & Chain: a Fanatic can declare NOTHING else — the lurch is its only
  // action (Standing only; a Prone Fanatic can still Stand Up first).
  if (
    hasSkill(player.skills, SkillType.BALL_AND_CHAIN) &&
    player.status === PlayerStatus.ACTIVE
  ) {
    return { ...none(), ballAndChain: true };
  }

  const board = actingBoard(input, here);
  const { blitz, foul, pass, handoff } = moveFirstActions(board);
  const { block, multipleBlock, jump } = standingStillActions(board);
  const { gaze, throwTeammate, kickTeammate, throwBomb, punt } =
    skillActions(board);
  const { directBlockReplacements, blitzBlockReplacements } =
    blockReplacementActions(board);

  // Rooted (Take Root) and Chomped players may not leave their square, so
  // no Move Action, Jump or Secure the Ball (2025 rulebook, Take Root).
  const heldInPlace =
    hasCondition(player, PlayerCondition.ROOTED) ||
    hasCondition(player, PlayerCondition.CHOMPED);

  return {
    move: !heldInPlace,
    block,
    multipleBlock,
    jump: jump && !heldInPlace,
    blitz,
    pass,
    punt,
    handoff,
    foul,
    standUp: player.status === PlayerStatus.PRONE,
    secureBall:
      !heldInPlace &&
      !hasSkill(player.skills, SkillType.UNSTEADY) &&
      board.ballReachable &&
      canSecureBall(player, ballPosition, [...opponents, ...teammates]),
    stab: directBlockReplacements.includes("stab"),
    breatheFire: directBlockReplacements.includes("breatheFire"),
    vomit: directBlockReplacements.includes("vomit"),
    gaze,
    chomp: directBlockReplacements.includes("chomp"),
    chainsaw: directBlockReplacements.includes("chainsaw"),
    throwTeammate,
    kickTeammate,
    throwBomb,
    ballAndChain: false,
    directBlockReplacements,
    blitzBlockReplacements,
  };
}
