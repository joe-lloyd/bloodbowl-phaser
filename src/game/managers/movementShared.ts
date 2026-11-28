import { activeRules } from "@/game/variants/activeMatch";
import { type IEventBus } from "../../services/EventBus";
import { type GameState } from "@/types/GameState";
import { type BallId, ballOnSquare, groundBall, placeBall } from "@/game/rules/balls";
import {
  opponentsOf,
  type Seating,
  seatOf,
  teammatesOf,
} from "../seating";
import {
  type Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { DodgeController } from "../controllers/DodgeController";
import { DiceController } from "../controllers/DiceController";
import { MovementValidator } from "../validators/MovementValidator";
import { BounceOperation } from "../operations/BounceOperation";
import {
  ArmourOperation,
  type ArmourFall,
} from "../operations/ArmourOperation";
import { CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { type IGameService } from "@/services/interfaces/IGameService";
import { type FlowContext, GameFlowManager } from "../core/GameFlowManager";
import { withRerollOffer, foldTrigger } from "../skills";
import {
  type RushDeclaredContext,
  type StandUpRollContext,
} from "../skills/SkillRule";
import { rushModifier } from "../inducements/matchInducements";
import {
  STAND_UP_TARGET,
  moveAllowance,
  standUpCost,
} from "../skills/movement";
import { carrierMayPass } from "../kickoff/ballConditions";
import { withDriveModifiers } from "../kickoff/driveEffects";
import { actsFromHere } from "../rules/actionAvailability";

export interface Square {
  x: number;
  y: number;
}

export interface MovementDeps {
  eventBus: IEventBus;
  state: GameState;
  seating: Seating;
  diceController: DiceController;
  dodgeController: DodgeController;
  movementValidator: MovementValidator;
  callbacks: {
    onTurnover: (reason: string) => void;
    onActivationFinished: (playerId: string) => void;
    onTouchdown?: (teamId: string, scorerId: string) => void;
    scoreRun: () => "stop" | "continue";
  };
}

export function movementUsed(state: GameState, playerId: string): number {
  return state.turn.movementUsed.get(playerId) || 0;
}

export function heldInSquare(eventBus: IEventBus, player: Player): boolean {
  if (
    !hasCondition(player, PlayerCondition.ROOTED) &&
    !hasCondition(player, PlayerCondition.CHOMPED)
  ) {
    return false;
  }
  eventBus.emit(
    GameEventNames.UI_Notification,
    `${player.playerName} cannot leave their square!`
  );
  return true;
}

export function isBallAt(state: GameState, square: Square): boolean {
  return ballOnSquare(state, square);
}

async function rollToStand(
  deps: MovementDeps,
  player: Player
): Promise<boolean> {
  if (player.stats.MA >= 3) return true;
  const ctx: StandUpRollContext = {
    player,
    teammates: teammatesOf(deps.seating, player.id),
    opponents: opponentsOf(deps.seating, player.teamId).filter(
      (p) => p.gridPosition
    ),
    modifiers: 0,
    triggers: [],
  };
  await foldTrigger("onStandUpRoll", [player], ctx);
  for (const t of ctx.triggers) {
    deps.eventBus.emit(GameEventNames.SkillTriggered, t);
  }
  const check = deps.diceController.rollSkillCheck(
    { reason: "Stand Up",target: STAND_UP_TARGET,modifier: ctx.modifiers,playerName: player.playerName }  );
  return check.success;
}

function actionContinues(deps: MovementDeps, player: Player): boolean {
  const { activePlayer } = deps.state;
  if (activePlayer?.id !== player.id || !activePlayer.action) return false;
  if (activePlayer.action === "pass" && !carrierMayPass(deps.state))
    return false;
  return actsFromHere(activePlayer.action, {
    player,
    ballPosition: groundBall(deps.state),
    opponents: opponentsOf(deps.seating, player.teamId),
    teammates: seatOf(deps.seating, player.teamId).team.players.filter(
      ({ id }) => id !== player.id
    ),
  });
}

export function finishIfSpent(deps: MovementDeps, player: Player): void {
  const allowance = moveAllowance(withDriveModifiers(player, deps.state));
  if (movementUsed(deps.state, player.id) < allowance) return;
  if (actionContinues(deps, player)) return;
  deps.callbacks.onActivationFinished(player.id);
}

export async function standToMove(
  deps: MovementDeps,
  player: Player,
  maView: Player
): Promise<boolean> {
  const cost = standUpCost(maView);
  const used = movementUsed(deps.state, player.id) + cost;
  const stood = await rollToStand(deps, maView);
  deps.state.turn.movementUsed.set(player.id, used);
  if (!stood) {
    deps.callbacks.onActivationFinished(player.id);
    return false;
  }
  rise(deps, player, cost);
  return true;
}

export function rise(
  { eventBus }: MovementDeps,
  player: Player,
  cost: number
): void {
  player.status = PlayerStatus.ACTIVE;
  eventBus.emit(GameEventNames.PlayerStoodUp, { playerId: player.id, cost });
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
}

export async function rollRush(
  { state, eventBus, diceController }: MovementDeps,
  player: Player,
  gameService: IGameService | undefined
) {
  const rushCtx: RushDeclaredContext = {
    player,
    modifiers: rushModifier(state, player),
    triggers: [],
  };
  await foldTrigger("onRushDeclared", [player], rushCtx);
  for (const t of rushCtx.triggers) {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  }
  const roll = () =>
    diceController.rollSkillCheck(
      { reason: "Rush",target: activeRules().rushTarget,modifier: rushCtx.modifiers,playerName: player.playerName }    );
  return gameService
    ? withRerollOffer({ gameService, eventBus }, player, "rush", roll)
    : roll();
}

export function fallOver(
  { eventBus, callbacks }: MovementDeps,
  fall: {
    player: Player;
    square: Square;
    bouncing: BallId | undefined;
    context: FlowContext | undefined;

    slip?: ArmourFall;
    reason: string;
  }
): void {
  const { player, square, context } = fall;
  eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  const ball = fall.bouncing;
  if (ball !== undefined && context?.flowManager) {
    context.gameService.placeBall(ball, square);
    context.flowManager.add(new BounceOperation(square, { ball }), true);
  }
  if (context?.flowManager) {
    context.flowManager.add(
      new ArmourOperation(player.id, undefined, fall.slip),
      true
    );
  }
  callbacks.onTurnover(fall.reason);
}

export function diveIntoVacated(
  eventBus: IEventBus,
  dive: {
    diverId: string | undefined;
    opponents: Player[];
    mover: Player;
    vacated: Square;
    landing: Square;
  }
): void {
  if (!dive.diverId) return;
  const diver = dive.opponents.find((p) => p.id === dive.diverId);
  if (!diver?.gridPosition) return;
  dive.mover.gridPosition = { ...dive.landing };
  const diverFrom = { ...diver.gridPosition };
  diver.gridPosition = { ...dive.vacated };
  diver.status = PlayerStatus.PRONE;
  eventBus.emit(GameEventNames.PlayerMoved, {
    playerId: diver.id,
    from: diverFrom,
    to: { ...dive.vacated },
    path: [diverFrom, { ...dive.vacated }],
    ballJoinStep: 0,
  });
  eventBus.emit(GameEventNames.PlayerStatusChanged, diver);
}

export function dropThroughTrapdoor(
  { state, eventBus, callbacks }: MovementDeps,
  player: Player,
  square: Square,
  carried: BallId | undefined,
  flowManager?: GameFlowManager
): void {
  if (carried !== undefined) {
    placeBall(state, carried, square);
    eventBus.emit(GameEventNames.BallPlaced, { ...square });
  }
  delete player.gridPosition;
  flowManager?.add(
    new CrowdInjuryOperation(player.id, { ...square }, {
      isTurnover: false,
      trapdoor: { carriedBall: carried !== undefined },
    }),
    true
  );
  callbacks.onTurnover("Fell through a Trapdoor");
}
