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
  const { state, eventBus } = deps;
  const player = findPlayer(deps, playerId);
  if (!player?.gridPosition) return Promise.reject("Player not found!");

  if (heldInSquare(eventBus, player)) return Promise.reject("Cannot move");
  if (player.status !== PlayerStatus.ACTIVE) {
    return Promise.reject("Only a Standing player may Jump");
  }
  // Drive modifiers (Dodgy Snack) apply to Jump costs too
  const maView = withDriveModifiers(player, state);

  const from = { ...player.gridPosition };
  const opponents = teamsOf(deps, player).opp.players.filter(
    (p) => p.status === PlayerStatus.ACTIVE && p.gridPosition
  );

  const over = jumpedSquare(deps, player, from, target);
  if (!over) {
    eventBus.emit(
      GameEventNames.UI_Notification,
      "You may only Jump over an adjacent player into their push-back squares"
    );
    return Promise.reject("Invalid Jump");
  }

  const preUsed = movementUsed(state, playerId);
  if (preUsed + JUMP_COST > moveAllowance(maView)) {
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} does not have the Movement to Jump`
    );
    return Promise.reject("Not enough movement to Jump");
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
    opponents,
    preUsed,
    holdingBall: isBallAt(state, from),
  };

  if (!(await rushBeforeJump(jump))) return;

  // Markers of the vacated square fold first (Tentacles, Prehensile Tail),
  // so the jumper's own Leap or Pogo sees every negative modifier.
  const leftMarkers = adjacentStanding(from, opponents);
  const jumpCtx = await declareJump(jump, leftMarkers);
  // Tentacles held the jumper: no Agility Test, no move, and the
  // activation ends, with no Turnover.
  if (jumpCtx.escapeCancelled) {
    deps.callbacks.onActivationFinished(playerId);
    return;
  }

  const { resolvedCtx, roll } = await rollJump(jump, jumpCtx, leftMarkers);
  diveIntoVacated(eventBus, {
    diverId: resolvedCtx.proneInVacated,
    opponents,
    mover: player,
    // A dive only follows a roll that passed, so the jumper lands in
    // the target square; it must be there before the diver takes `from`.
    vacated: from,
    landing: target,
  });

  const saved =
    !resolvedCtx.success &&
    (await steadyFootingSaves(
      player,
      deps.diceController,
      eventBus,
      jump.gameService
    ));
  if (resolvedCtx.success || saved) {
    await landJump(jump, resolvedCtx.success || roll !== 1 ? target : from);
    return;
  }
  fallFromJump(jump, roll);
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

/**
 * Roll each Rush BEFORE the Jump test. A failed Rush drops the player in
 * the square they are in, ends the activation, and is a Turnover. Returns
 * false when the player fell.
 */
async function rushBeforeJump(jump: JumpRun): Promise<boolean> {
  const { deps, player, maView, gameService } = jump;
  const rushesNeeded = Math.max(0, jump.preUsed + JUMP_COST - maView.stats.MA);
  for (let i = 0; i < rushesNeeded; i++) {
    const check = await rollRush(deps, player, gameService);
    if (
      check.success ||
      (await steadyFootingSaves(
        player,
        deps.diceController,
        deps.eventBus,
        gameService
      ))
    ) {
      continue;
    }
    player.status = PlayerStatus.PRONE;
    deps.state.turn.movementUsed.set(player.id, moveAllowance(maView));
    fallOver(deps, {
      player,
      square: jump.from,
      ballBounces: jump.holdingBall,
      context: jump.context,
      reason: "Failed Rush",
    });
    deps.callbacks.onActivationFinished(player.id);
    return false;
  }
  return true;
}

/**
 * Trigger point: Jump declared. The marking penalty is the greater of the
 * markers on the from and to squares; rules may add to it or offset it.
 */
async function declareJump(
  jump: JumpRun,
  leftMarkers: Player[]
): Promise<JumpDeclaredContext> {
  const { deps, player, gameService, from, target, opponents } = jump;
  const markFrom = -deps.dodgeController.calculateDodgeModifiers(
    from,
    opponents
  );
  const markTo = -deps.dodgeController.calculateDodgeModifiers(
    target,
    opponents
  );
  const penalty = Math.max(markFrom, markTo);
  const jumpCtx: JumpDeclaredContext = {
    player,
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
  await foldTrigger("onJumpDeclared", leftMarkers, jumpCtx);
  if (!jumpCtx.escapeCancelled) {
    await foldTrigger("onJumpDeclared", [player], jumpCtx);
  }
  jumpCtx.triggers.forEach((t) =>
    deps.eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  return jumpCtx;
}

/**
 * Rolls the Jump's Agility Test after any re-rolls and spends its
 * movement; markers of the vacated square then react (Diving Tackle).
 */
async function rollJump(
  jump: JumpRun,
  jumpCtx: JumpDeclaredContext,
  leftMarkers: Player[]
): Promise<{ resolvedCtx: JumpResolvedContext; roll: number }> {
  const { deps, player, gameService, from, target } = jump;
  const modifier = jumpCtx.negativeModifier + jumpCtx.bonusModifier;

  const roll = () =>
    deps.diceController.rollSkillCheck(
      "Jump",
      player.stats.AG,
      modifier,
      player.playerName
    );
  const rolled = gameService
    ? await withRerollOffer(
        { gameService, eventBus: deps.eventBus },
        player,
        "jump",
        roll
      )
    : roll();
  deps.state.turn.movementUsed.set(player.id, jump.preUsed + JUMP_COST);

  const resolvedCtx: JumpResolvedContext = {
    player,
    from,
    to: { ...target },
    naturalRoll: rolled.roll,
    target: player.stats.AG,
    modifiers: modifier,
    success: rolled.success,
    decisions: gameService?.getDecisionService(),
    flow: jump.context?.flowManager,
    arbiter: gameService?.getRerollArbiter(),
    dice: deps.diceController,
    triggers: [],
  };
  await foldTrigger("onJumpResolved", leftMarkers, resolvedCtx);
  resolvedCtx.triggers.forEach((t) =>
    deps.eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  return { resolvedCtx, roll: rolled.roll };
}

/**
 * The jumper Stands in `destination`: the target, or the square they left
 * when Steady Footing saved a natural 1.
 */
async function landJump(jump: JumpRun, destination: Square): Promise<void> {
  const { deps, player, from, holdingBall } = jump;
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
      jump.context?.flowManager
    );
    return;
  }
  if (await ballEndsJump(jump, destination)) return;
  if (jump.preUsed + JUMP_COST >= moveAllowance(jump.maView)) {
    deps.callbacks.onActivationFinished(player.id);
  }
}

/**
 * The ball after a landing: a carried ball moves with the jumper and may
 * score, and a loose ball on the square is picked up. True when that ends
 * the activation.
 */
async function ballEndsJump(
  jump: JumpRun,
  destination: Square
): Promise<boolean> {
  const { deps, player, context } = jump;
  if (jump.holdingBall) {
    jump.gameService?.setBallPosition(destination.x, destination.y);
    deps.state.ballPosition = { ...destination };
    deps.eventBus.emit(GameEventNames.BallPlaced, { ...destination });
    const side = player.teamId === deps.team1.id ? 1 : 2;
    if (!isInEndZone(destination, GameConfig.PITCH_WIDTH, side)) return false;
    deps.callbacks.onTouchdown?.(player.teamId, player.id);
    return true;
  }
  if (!context || !isBallAt(deps.state, destination)) return false;
  // Landing on the loose ball: the Pick-up comes after the Jump. A
  // failed Pick-up bounces the ball and causes the Turnover itself.
  const pickupOp = new PickupOperation(player.id);
  await pickupOp.execute(context);
  if (!pickupOp.success) return true;
  if (isSecuringBall(deps.state, player.id)) {
    deps.callbacks.onActivationFinished(player.id);
    return true;
  }
  return false;
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
