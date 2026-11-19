import {
  type Player,
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
  type BlockReplacement,
  BLOCK_REPLACEMENTS,
} from "../../types/BlockReplacement";
import {
  hasReachableBlockReplacementTarget,
  legalBlockReplacementTargets,
} from "./blockReplacements";
import { type ActionType } from "../../types/events";

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

  hasThrownTeamMate: boolean;
  hasKickedTeamMate: boolean;
}

export interface ActionAvailabilityInput {
  player: Player;
  ballPosition: { x: number; y: number } | null;

  opponents: Player[];

  teammates: Player[];

  reachable: { x: number; y: number; cost?: number }[];
  turn: TurnFlags;

  hasMovedInAction: boolean;

  secondActionAfter?: ActionType;
}

export interface ActionAvailability {
  move: boolean;

  block: boolean;
  multipleBlock: boolean;

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

  throwBomb: boolean;

  ballAndChain: boolean;

  directBlockReplacements: BlockReplacement[];

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
  const all = computeActionAvailability({
    ...input,
    hasMovedInAction: false,
    ...(undefined === undefined ? {} : { secondActionAfter: undefined }),
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

interface Square {
  x: number;
  y: number;
}

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

    handoffEligibleMates: teammates.filter(
      (t) => onPitch(t) && hasTackleZone(t)
    ),
    ballReachable,
    canHaveBall: holdsBall || ballReachable,
    canEndAdjacentTo: (target) =>
      endSquares.some((s) => chebyshev(s, target) === 1),
  };
}

function moveFirstActions(board: ActingBoard) {
  const { input, canEndAdjacentTo, canHaveBall } = board;
  const { player, turn } = input;
  const fresh = !input.hasMovedInAction;

  const blitz =
    !turn.hasBlitzed &&
    fresh &&
    board.standingEnemies.some((e) => canEndAdjacentTo(e.gridPosition!));
  const foul =
    !turn.hasFouled &&
    fresh &&
    board.downEnemies.some((e) => canEndAdjacentTo(e.gridPosition!));

  const myBall = hasSkill(player.skills, SkillType.MY_BALL);
  const pass = !myBall && !turn.hasPassed && fresh && canHaveBall;

  const handoff =
    !myBall &&
    !turn.hasHandedOff &&
    fresh &&
    canHaveBall &&
    board.handoffEligibleMates.some((t) => canEndAdjacentTo(t.gridPosition!));
  return { blitz, foul, pass, handoff };
}

function standingStillActions(board: ActingBoard) {
  const { input, here } = board;
  const { player, opponents, teammates } = input;
  const adjacentEnemies = board.standingEnemies.filter(
    (e) => chebyshev(here, e.gridPosition!) === 1
  );

  const block =
    adjacentEnemies.length > 0 &&
    !input.hasMovedInAction &&
    (isStanding(player) || hasSkill(player.skills, SkillType.JUMP_UP));
  const multipleBlock =
    !input.hasMovedInAction &&
    hasSkill(player.skills, SkillType.MULTIPLE_BLOCK) &&
    adjacentEnemies.length >= 2;

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

function blockReplacementActions(board: ActingBoard) {
  const { player, opponents, reachable, turn } = board.input;
  const fresh = !board.input.hasMovedInAction;

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

function skillActions(board: ActingBoard) {
  const { input, here, canHaveBall } = board;
  const { player } = input;
  const gaze =
    hasSkill(player.skills, SkillType.HYPNOTIC_GAZE) &&
    board.standingEnemies.some((e) => board.canEndAdjacentTo(e.gridPosition!));

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
