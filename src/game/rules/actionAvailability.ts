import {
  type Player,
  PlayerCondition,
  PlayerStatus,
  hasCondition,
  hasTackleZone,
} from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { isRightStuffEligible } from "./throwTeammate";
import { legalJumpTargets } from "./jump";
import { canSecureBall } from "./secureBall";
import {
  type BlockReplacement,
  BLOCK_REPLACEMENTS,
} from "../../types/BlockReplacement";
import {
  hasReachableBlockReplacementTarget,
  legalBlockReplacementTargets,
} from "./blockReplacements";
import { type ActionType } from "../../types/events";
import { chebyshev } from "./chebyshev";
import { freshSpend, maySpend, type TurnSpend } from "./turnSpend";
import { activeRules } from "../variants/activeMatch";

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

function actionHasMove(action: ActionType): boolean {
  return ACTIONS_WITH_A_MOVE.has(action);
}

export function usesBaseMove(action: ActionType): boolean {
  return actionHasMove(action) && action !== "ballAndChain";
}

export function razzleDazzleAllows(
  first: ActionType,
  second: ActionType
): boolean {
  return (
    first !== second &&
    !(actionHasMove(first) && actionHasMove(second))
  );
}

export interface TurnFlags {
  spend: TurnSpend;

  hasThrownTeamMate: boolean;
  hasKickedTeamMate: boolean;
  hasPunted?: boolean;
}

const UNSPENT_FLAGS: TurnFlags = {
  spend: freshSpend(),
  hasThrownTeamMate: false,
  hasKickedTeamMate: false,
};

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

function withoutSecondAction(
  input: ActionAvailabilityInput
): ActionAvailabilityInput {
  const copy = { ...input };
  delete copy.secondActionAfter;
  return copy;
}

function secondActionAvailability(
  input: ActionAvailabilityInput,
  first: ActionType
): ActionAvailability {
  const all = computeActionAvailability({
    ...withoutSecondAction(input),
    hasMovedInAction: false,
  });
  const allowed = restrictAvailability(all, (action) =>
    razzleDazzleAllows(first, action)
  );
  return { ...allowed, standUp: false };
}

export function restrictAvailability(
  all: ActionAvailability,
  allows: (action: ActionType) => boolean
): ActionAvailability {
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
    standUp: all.standUp && allows("move"),
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

export const noActionAvailability = (): ActionAvailability => ({
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

function endsNextTo(
  target: Player,
  endSquares: readonly { x: number; y: number }[]
): boolean {
  const at = target.gridPosition;
  return at !== undefined && endSquares.some((square) => chebyshev(square, at) === 1);
}

export function canBlitzTo(
  target: Player,
  endSquares: readonly { x: number; y: number }[]
): boolean {
  return isStanding(target) && endsNextTo(target, endSquares);
}

export function canFoulFrom(
  target: Player,
  endSquares: readonly { x: number; y: number }[]
): boolean {
  return isDown(target) && endsNextTo(target, endSquares);
}

function blitzable(ledger: TurnSpend, opponents: Player[]): Player[] {
  return opponents.filter((o) =>
    maySpend(ledger, { kind: "blitz", against: o.teamId })
  );
}

function moveFirstActions(board: ActingBoard) {
  const { input, canEndAdjacentTo, canHaveBall } = board;
  const { player, turn } = input;
  const fresh = !input.hasMovedInAction;

  const blitz =
    fresh &&
    blitzable(turn.spend, board.standingEnemies).some((e) =>
      canEndAdjacentTo(e.gridPosition!)
    );
  const foul =
    fresh &&
    board.downEnemies.some(
      (e) =>
        maySpend(turn.spend, { kind: "foul", against: e.teamId }) &&
        canEndAdjacentTo(e.gridPosition!)
    );

  const myBall = hasSkill(player.skills, SkillType.MY_BALL);
  const pass =
    !myBall && maySpend(turn.spend, { kind: "pass" }) && fresh && canHaveBall;

  const handoff =
    !myBall &&
    maySpend(turn.spend, { kind: "handoff" }) &&
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

  const jump =
    isStanding(player) &&
    legalJumpTargets(player, here, [...opponents, ...teammates]).length > 0;
  return { block, multipleBlock, jump };
}

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
  const targets = blitzable(turn.spend, opponents);
  const blitzBlockReplacements =
    targets.length > 0 && fresh
      ? BLOCK_REPLACEMENTS.filter((replacement) =>
          hasReachableBlockReplacementTarget(
            player,
            targets,
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
  const throwSpent = activeRules().format.teamMateThrowUsesPass
    ? !maySpend(input.turn.spend, { kind: "pass" })
    : input.turn.hasThrownTeamMate;
  const throwTeammate =
    hasSkill(player.skills, SkillType.THROW_TEAM_MATE) &&
    !throwSpent &&
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
    !input.turn.hasPunted &&
    hasSkill(player.skills, SkillType.PUNT) &&
    (isStanding(player) || player.status === PlayerStatus.PRONE) &&
    canHaveBall;
  return { gaze, throwTeammate, kickTeammate, throwBomb, punt };
}

type AfterMove = Extract<
  ActionType,
  "pass" | "punt" | "handoff" | "foul" | "gaze" | "throwTeamMate"
>;

const LEFT_AFTER_MOVE: Record<
  AfterMove,
  (available: ActionAvailability) => boolean
> = {
  pass: ({ pass }) => pass,
  punt: ({ punt }) => punt,
  handoff: ({ handoff }) => handoff,
  foul: ({ foul }) => foul,
  gaze: ({ gaze }) => gaze,
  throwTeamMate: ({ throwTeammate, kickTeammate }) =>
    throwTeammate || kickTeammate,
};

const endsWithAnAct = (action: ActionType): action is AfterMove =>
  Object.hasOwn(LEFT_AFTER_MOVE, action);

export function actsFromHere(
  action: ActionType,
  board: Pick<
    ActionAvailabilityInput,
    "player" | "ballPosition" | "opponents" | "teammates"
  >
): boolean {
  if (!endsWithAnAct(action) || board.player.status !== PlayerStatus.ACTIVE)
    return false;
  return LEFT_AFTER_MOVE[action](
    computeActionAvailability({
      ...board,
      reachable: [],
      turn: UNSPENT_FLAGS,
      hasMovedInAction: false,
    })
  );
}

export function computeActionAvailability(
  input: ActionAvailabilityInput
): ActionAvailability {
  const first = input.secondActionAfter;
  if (first) return secondActionAvailability(input, first);
  const { player, ballPosition, opponents, teammates } = input;
  const here = player.gridPosition;
  if (!here) return noActionAvailability();

  const canAct = !player.hasActed && player.status !== PlayerStatus.STUNNED;
  if (!canAct) return { ...noActionAvailability(), standUp: false };

  if (
    hasSkill(player.skills, SkillType.BALL_AND_CHAIN) &&
    player.status === PlayerStatus.ACTIVE
  ) {
    return { ...noActionAvailability(), ballAndChain: true };
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
