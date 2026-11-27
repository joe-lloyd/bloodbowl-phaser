import { type Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { PickupOperation } from "../operations/PickupOperation";
import { type IGameService } from "@/services/interfaces/IGameService";
import { type FlowContext } from "../core/GameFlowManager";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { scoresAt } from "../rules/frames";
import { pairFrame } from "../variants/activeMatch";
import { withRerollOffer, foldTrigger, adjacentStanding } from "../skills";
import { moveAllowance } from "../skills/movement";
import { withDriveModifiers } from "../kickoff/driveEffects";
import {
  type JumpDeclaredContext,
  type JumpResolvedContext,
} from "../skills/SkillRule";
import { JUMP_COST, jumpRushes, legalJumpTargets } from "../rules/jump";
import { trapdoorOpens } from "../inducements/matchInducements";
import { isSecuringBall } from "../rules/secureBall";
import {
  type MovementDeps,
  type Square,
  diveIntoVacated,
  dropThroughTrapdoor,
  fallOver,
  findPlayer,
  finishIfSpent,
  heldInSquare,
  isBallAt,
  movementUsed,
  rollRush,
  teamsOf,
} from "./movementShared";

interface JumpRun {
  deps: MovementDeps;
  player: Player;

  maView: Player;
  context: FlowContext | undefined;
  gameService: IGameService | undefined;
  from: Square;
  target: Square;

  over: Square;

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
  if (!prepared.ok) throw new Error(prepared.reason);
  const { jump } = prepared;
  const { player, gameService } = jump;
  const { eventBus, diceController } = deps;

  const rushesNeeded = jumpRushes(jump.preUsed, jump.maView.stats.MA);
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

  const leftMarkers = adjacentStanding(jump.from, jump.opponents);
  await foldTrigger("onJumpDeclared", leftMarkers, jumpCtx);
  if (!jumpCtx.escapeCancelled) {
    await foldTrigger("onJumpDeclared", [player], jumpCtx);
  }
  for (const t of jumpCtx.triggers) {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  }

  if (jumpCtx.escapeCancelled) {
    deps.callbacks.onActivationFinished(playerId);
    return;
  }
  const modifier = jumpCtx.negativeModifier + jumpCtx.bonusModifier;

  const rollJump = () =>
    diceController.rollSkillCheck(
      { reason: "Jump",target: player.stats.AG,modifier,playerName: player.playerName }    );
  const rolled = gameService
    ? await withRerollOffer({ gameService, eventBus }, player, "jump", rollJump)
    : rollJump();
  deps.state.turn.movementUsed.set(playerId, jump.preUsed + JUMP_COST);

  const resolvedCtx = jumpResolvedContext(jump, rolled, modifier);
  await foldTrigger("onJumpResolved", leftMarkers, resolvedCtx);
  for (const t of resolvedCtx.triggers) {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  }
  diveIntoVacated(eventBus, {
    diverId: resolvedCtx.proneInVacated,
    opponents: jump.opponents,
    mover: player,

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

  const pickupOp = new PickupOperation(playerId);
  await pickupOp.execute(pickupContext);
  if (pickupOp.success) finishAfterPickup(jump);
}

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

function jumpedSquare(
  { team1, team2 }: MovementDeps,
  player: Player,
  from: Square,
  target: Square
): Square | undefined {
  return legalJumpTargets(player, from, [...team1.players, ...team2.players]).find(
    (t) => t.dest.x === target.x && t.dest.y === target.y
  )?.over;
}

function fallOnRush(jump: JumpRun): void {
  const { deps, player } = jump;
  player.status = PlayerStatus.PRONE;
  deps.state.turn.movementUsed.set(player.id, moveAllowance(jump.maView));
  fallOver(deps, {
    player,
    square: jump.from,
    ballBounces: jump.holdingBall,
    context: jump.context,
    slip: { cause: "rush" },
    reason: "Failed Rush",
  });
  deps.callbacks.onActivationFinished(player.id);
}

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
    ...(gameService && { decisions: gameService.getDecisionService(), arbiter: gameService.getRerollArbiter() }),
    ...(jump.context?.flowManager !== undefined && { flow: jump.context?.flowManager }),
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
    ...(gameService && { decisions: gameService.getDecisionService(), arbiter: gameService.getRerollArbiter() }),
    ...(jump.context?.flowManager !== undefined && { flow: jump.context?.flowManager }),
    dice: jump.deps.diceController,
    triggers: [],
  };
}

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
    ...(holdingBall && { ballFrom: from, ballPath: [from, { ...destination }] }),
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
  finishIfSpent(jump.deps, jump.player);
  return undefined;
}

function carriedBallScores(jump: JumpRun, destination: Square): boolean {
  const { deps, player } = jump;
  jump.gameService?.setBallPosition(destination.x, destination.y);
  deps.state.ballPosition = { ...destination };
  deps.eventBus.emit(GameEventNames.BallPlaced, { ...destination });
  const frame = pairFrame(player.teamId === deps.team1.id);
  if (!scoresAt(frame, destination)) return false;
  deps.callbacks.onTouchdown?.(player.teamId, player.id);
  return true;
}

function finishAfterPickup(jump: JumpRun): void {
  if (isSecuringBall(jump.deps.state, jump.player.id)) {
    jump.deps.callbacks.onActivationFinished(jump.player.id);
    return;
  }
  finishIfSpent(jump.deps, jump.player);
}

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
