/**
 * Jump over a single adjacent square into an unoccupied square beyond, as
 * part of a Move Action (2025 rulebook p.56). By default the jumped-over
 * square must hold a Prone or Stunned player; Leap/Pogo let a player Jump
 * over any square. The Jump costs 2 squares of Movement (Rushing as needed,
 * each Rush rolled before the Jump), and an Agility Test with a negative
 * modifier equal to the greater of the opponents Marking the from square and
 * the to square. Pass → Stand in the target and continue; fail → Fall Over in
 * the target (a natural 1 → Fall Over where they stand); either fall ends the
 * activation and is a Turnover.
 *
 * As in moveAction.ts, every await sits in jumpPlayer itself, where the old
 * MovementManager method had it; the work between awaits is synchronous.
 */

import { Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { PickupOperation } from "../operations/PickupOperation";
import { IGameService } from "@/services/interfaces/IGameService";
import { FlowContext } from "../core/GameFlowManager";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { isInEndZone } from "../elements/GridUtils";
import { GameConfig } from "../../config/GameConfig";
import { withRerollOffer, foldTrigger, adjacentStanding } from "../skills";
import { moveAllowance } from "../skills/movement";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { JumpDeclaredContext, JumpResolvedContext } from "../skills/SkillRule";
import { SkillType, hasSkill } from "../../types/Skills";
import { jumpTargets } from "../rules/jump";
import { trapdoorOpens } from "../inducements/matchInducements";
import { isSecuringBall } from "../rules/secureBall";
import {
  MovementDeps,
  Square,
  diveIntoVacated,
  dropThroughTrapdoor,
  fallOver,
  findPlayer,
  heldInSquare,
  isBallAt,
  movementUsed,
  rollRush,
  teamsOf,
} from "./movementShared";

/** A Jump moves 2 squares; those beyond the MA are Rushes. */
const JUMP_COST = 2;

/** One Jump while it resolves. */
interface JumpRun {
  deps: MovementDeps;
  player: Player;
  /** The drive-modified MA view (Dodgy Snack -1 MA). */
  maView: Player;
  context: FlowContext | undefined;
  gameService: IGameService | undefined;
  from: Square;
  target: Square;
  /** The square jumped over. */
  over: Square;
  /** Standing opponents on the pitch: they mark squares and react to jumps. */
  opponents: Player[];
  preUsed: number;
  holdingBall: boolean;
}

export async function jumpPlayer(
  deps: MovementDeps,
  playerId: string,
  target: Square,
  context?: FlowContext
): Promise<void> {
  const prepared = prepareJump(deps, playerId, target, context);
  if (!prepared.ok) return Promise.reject(prepared.reason);
  const { jump } = prepared;
  const { player, gameService } = jump;
  const { eventBus, diceController } = deps;

  // Roll each Rush BEFORE the Jump test. A failed Rush drops the player in
  // the square they are in, ends the activation, and is a Turnover.
  const rushesNeeded = Math.max(
    0,
    jump.preUsed + JUMP_COST - jump.maView.stats.MA
  );
  for (let i = 0; i < rushesNeeded; i++) {
    const check = await rollRush(deps, player, gameService);
    if (
      !check.success &&
      !(await steadyFootingSaves(player, diceController, eventBus, gameService))
    ) {
      fallOnRush(jump);
      return;
    }
  }

  const jumpCtx = jumpDeclaredContext(jump);
  // Markers of the vacated square fold first (Tentacles, Prehensile Tail),
  // so the jumper's own Leap or Pogo sees every negative modifier.
  const leftMarkers = adjacentStanding(jump.from, jump.opponents);
  await foldTrigger("onJumpDeclared", leftMarkers, jumpCtx);
  if (!jumpCtx.escapeCancelled) {
    await foldTrigger("onJumpDeclared", [player], jumpCtx);
  }
  jumpCtx.triggers.forEach((t) =>
    eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  // Tentacles held the jumper: no Agility Test, no move, and the
  // activation ends, with no Turnover.
  if (jumpCtx.escapeCancelled) {
    deps.callbacks.onActivationFinished(playerId);
    return;
  }
  const modifier = jumpCtx.negativeModifier + jumpCtx.bonusModifier;

  const rollJump = () =>
    diceController.rollSkillCheck(
      "Jump",
      player.stats.AG,
      modifier,
      player.playerName
    );
  const rolled = gameService
    ? await withRerollOffer({ gameService, eventBus }, player, "jump", rollJump)
    : rollJump();
  deps.state.turn.movementUsed.set(playerId, jump.preUsed + JUMP_COST);

  // Markers of the vacated square react after any re-rolls (Diving Tackle).
  const resolvedCtx = jumpResolvedContext(jump, rolled, modifier);
  await foldTrigger("onJumpResolved", leftMarkers, resolvedCtx);
  resolvedCtx.triggers.forEach((t) =>
    eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  diveIntoVacated(eventBus, {
    diverId: resolvedCtx.proneInVacated,
    opponents: jump.opponents,
    mover: player,
    // A dive only follows a roll that passed, so the jumper lands in
    // the target square; it must be there before the diver takes `from`.
    vacated: jump.from,
    landing: target,
  });

  const saved =
    !resolvedCtx.success &&
    (await steadyFootingSaves(player, diceController, eventBus, gameService));
  if (!resolvedCtx.success && !saved) {
    fallFromJump(jump, rolled.roll);
    return;
  }
  const pickupContext = landJump(jump, resolvedCtx.success, rolled.roll);
  if (!pickupContext) return;
  // Landing on the loose ball: the Pick-up comes after the Jump. A
  // failed Pick-up bounces the ball and causes the Turnover itself.
  const pickupOp = new PickupOperation(playerId);
  await pickupOp.execute(pickupContext);
  if (pickupOp.success) finishAfterPickup(jump);
}

/** Checks the Jump before any dice: who jumps, over what, and the cost. */
function prepareJump(
  deps: MovementDeps,
  playerId: string,
  target: Square,
  context: FlowContext | undefined
): { ok: true; jump: JumpRun } | { ok: false; reason: string } {
  const { state, eventBus } = deps;
  const player = findPlayer(deps, playerId);
  if (!player?.gridPosition) return { ok: false, reason: "Player not found!" };

  if (heldInSquare(eventBus, player))
    return { ok: false, reason: "Cannot move" };
  if (player.status !== PlayerStatus.ACTIVE) {
    return { ok: false, reason: "Only a Standing player may Jump" };
  }
  // Drive modifiers (Dodgy Snack) apply to Jump costs too
  const maView = withDriveModifiers(player, state);

  const from = { ...player.gridPosition };
  const over = jumpedSquare(deps, player, from, target);
  if (!over) {
    eventBus.emit(
      GameEventNames.UI_Notification,
      "You may only Jump over an adjacent player into their push-back squares"
    );
    return { ok: false, reason: "Invalid Jump" };
  }

  const preUsed = movementUsed(state, playerId);
  if (preUsed + JUMP_COST > moveAllowance(maView)) {
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} does not have the Movement to Jump`
    );
    return { ok: false, reason: "Not enough movement to Jump" };
  }
  const jump: JumpRun = {
    deps,
    player,
    maView,
    context,
    gameService: context?.gameService,
    from,
    target,
    over,
    opponents: teamsOf(deps, player).opp.players.filter(
      (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
    ),
    preUsed,
    holdingBall: isBallAt(state, from),
  };
  return { ok: true, jump };
}

/** The target must be one of the jumped-over player's push-back squares. */
function jumpedSquare(
  { team1, team2 }: MovementDeps,
  player: Player,
  from: Square,
  target: Square
): Square | undefined {
  const others = [...team1.players, ...team2.players].filter(
    (p) => p.id !== player.id && p.gridPosition
  );
  const canJumpAnything =
    hasSkill(player.skills, SkillType.LEAP) ||
    hasSkill(player.skills, SkillType.POGO);
  const inBounds = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < GameConfig.PITCH_WIDTH &&
    y < GameConfig.PITCH_HEIGHT;
  return jumpTargets(from, others, canJumpAnything, inBounds).find(
    (t) => t.dest.x === target.x && t.dest.y === target.y
  )?.over;
}

/** A failed Rush before the Jump: the player Falls Over where they stand. */
function fallOnRush(jump: JumpRun): void {
  const { deps, player } = jump;
  player.status = PlayerStatus.PRONE;
  deps.state.turn.movementUsed.set(player.id, moveAllowance(jump.maView));
  fallOver(deps, {
    player,
    square: jump.from,
    ballBounces: jump.holdingBall,
    context: jump.context,
    reason: "Failed Rush",
  });
  deps.callbacks.onActivationFinished(player.id);
}

/**
 * Trigger point: Jump declared. The marking penalty is the greater of the
 * markers on the from and to squares; rules may add to it or offset it.
 */
function jumpDeclaredContext(jump: JumpRun): JumpDeclaredContext {
  const { deps, gameService, from, target, opponents } = jump;
  const markFrom = -deps.dodgeController.calculateDodgeModifiers(
    from,
    opponents
  );
  const markTo = -deps.dodgeController.calculateDodgeModifiers(
    target,
    opponents
  );
  const penalty = Math.max(markFrom, markTo);
  return {
    player: jump.player,
    from,
    to: { ...target },
    over: { ...jump.over },
    negativeModifier: -penalty,
    bonusModifier: 0,
    decisions: gameService?.getDecisionService(),
    flow: jump.context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
    dice: deps.diceController,
    triggers: [],
  };
}

function jumpResolvedContext(
  jump: JumpRun,
  rolled: { roll: number; success: boolean },
  modifier: number
): JumpResolvedContext {
  const { player, gameService } = jump;
  return {
    player,
    from: jump.from,
    to: { ...jump.target },
    naturalRoll: rolled.roll,
    target: player.stats.AG,
    modifiers: modifier,
    success: rolled.success,
    decisions: gameService?.getDecisionService(),
    flow: jump.context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
    dice: jump.deps.diceController,
    triggers: [],
  };
}

/**
 * The jumper Stands in the target, or in the square they left when Steady
 * Footing saved a natural 1. Returns the flow context when a loose ball
 * waits on the landing square for a Pick-up.
 */
function landJump(
  jump: JumpRun,
  success: boolean,
  roll: number
): FlowContext | undefined {
  const { deps, player, from, holdingBall, context } = jump;
  const destination = success || roll !== 1 ? jump.target : from;
  player.gridPosition = { ...destination };
  deps.eventBus.emit(GameEventNames.PlayerMoved, {
    playerId: player.id,
    from,
    to: { ...destination },
    path: [from, { ...destination }],
    ballFrom: holdingBall ? from : undefined,
    ballPath: holdingBall ? [from, { ...destination }] : undefined,
    ballJoinStep: 0,
  });
  if (
    destination !== from &&
    trapdoorOpens(deps.state, deps.diceController, player, destination)
  ) {
    dropThroughTrapdoor(
      deps,
      player,
      destination,
      holdingBall,
      context?.flowManager
    );
    return undefined;
  }
  if (holdingBall) {
    if (carriedBallScores(jump, destination)) return undefined;
  } else if (context && isBallAt(deps.state, destination)) {
    return context;
  }
  finishIfSpent(jump);
  return undefined;
}

/** A carried ball lands with the jumper; true when it scores. */
function carriedBallScores(jump: JumpRun, destination: Square): boolean {
  const { deps, player } = jump;
  jump.gameService?.setBallPosition(destination.x, destination.y);
  deps.state.ballPosition = { ...destination };
  deps.eventBus.emit(GameEventNames.BallPlaced, { ...destination });
  const side = player.teamId === deps.team1.id ? 1 : 2;
  if (!isInEndZone(destination, GameConfig.PITCH_WIDTH, side)) return false;
  deps.callbacks.onTouchdown?.(player.teamId, player.id);
  return true;
}

/** After a successful Pick-up on landing: Secure the Ball ends the activation. */
function finishAfterPickup(jump: JumpRun): void {
  if (isSecuringBall(jump.deps.state, jump.player.id)) {
    jump.deps.callbacks.onActivationFinished(jump.player.id);
    return;
  }
  finishIfSpent(jump);
}

function finishIfSpent(jump: JumpRun): void {
  if (jump.preUsed + JUMP_COST >= moveAllowance(jump.maView)) {
    jump.deps.callbacks.onActivationFinished(jump.player.id);
  }
}

/**
 * Failure: a natural 1 Falls Over where they stand; any other failure
 * Falls Over in the target square. Either way the activation ends and it
 * is a Turnover.
 */
function fallFromJump(jump: JumpRun, roll: number): void {
  const { deps, player, from } = jump;
  const fallSquare = roll === 1 ? from : { ...jump.target };
  player.gridPosition = { ...fallSquare };
  player.status = PlayerStatus.PRONE;
  if (fallSquare.x !== from.x || fallSquare.y !== from.y) {
    deps.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: player.id,
      from,
      to: { ...fallSquare },
      path: [from, { ...fallSquare }],
      ballJoinStep: 0,
    });
  }
  fallOver(deps, {
    player,
    square: fallSquare,
    ballBounces: jump.holdingBall || isBallAt(deps.state, fallSquare),
    context: jump.context,
    reason: "Failed Jump",
  });
  deps.callbacks.onActivationFinished(player.id);
}
