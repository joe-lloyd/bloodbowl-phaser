import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import {
  Player,
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "@/types/Player";
import { GameEventNames } from "../../types/events";
import { DodgeController } from "../controllers/DodgeController";
import { DiceController } from "../controllers/DiceController";
import { MovementValidator } from "../validators/MovementValidator";
import { BounceOperation } from "../operations/BounceOperation";
import { ArmourOperation } from "../operations/ArmourOperation";
import { CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { IGameService } from "@/services/interfaces/IGameService";
import { FlowContext, GameFlowManager } from "../core/GameFlowManager";
import { withRerollOffer, foldTrigger } from "../skills";
import { RushDeclaredContext, StandUpRollContext } from "../skills/SkillRule";
import { rushModifier } from "../inducements/matchInducements";

export type Square = { x: number; y: number };

/** What the Move and Jump actions share with MovementManager. */
export interface MovementDeps {
  eventBus: IEventBus;
  state: GameState;
  team1: Team;
  team2: Team;
  diceController: DiceController;
  dodgeController: DodgeController;
  movementValidator: MovementValidator;
  callbacks: {
    onTurnover: (reason: string) => void;
    onActivationFinished: (playerId: string) => void;
    onTouchdown?: (teamId: string, scorerId: string) => void;
  };
}

export function movementUsed(state: GameState, playerId: string): number {
  return state.turn.movementUsed.get(playerId) || 0;
}

export function findPlayer(
  { team1, team2 }: MovementDeps,
  playerId: string
): Player | undefined {
  return (
    team1.players.find((p) => p.id === playerId) ||
    team2.players.find((p) => p.id === playerId)
  );
}

/** The player's own team and the one they play against. */
export function teamsOf(
  { team1, team2 }: MovementDeps,
  player: Player
): { own: Team; opp: Team } {
  return player.teamId === team1.id
    ? { own: team1, opp: team2 }
    : { own: team2, opp: team1 };
}

/**
 * Rooted and Chomped players may not leave their square (2025 conditions).
 * Tells the coach so and returns true when the player is held.
 */
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

/** A player who falls onto the loose ball's square knocks it loose too. */
export function isBallAt(state: GameState, square: Square): boolean {
  return (
    !!state.ballPosition &&
    state.ballPosition.x === square.x &&
    state.ballPosition.y === square.y
  );
}

/**
 * 2025: a player with MA less than 3 must roll to stand up (4+, natural
 * 1 fails; Timmm-ber! adds +1 per Open Standing adjacent team-mate). A
 * failed attempt keeps them Prone, spends the movement, and ends the
 * activation. Returns true when the player may stand.
 */
export async function rollToStand(
  deps: MovementDeps,
  player: Player
): Promise<boolean> {
  if (player.stats.MA >= 3) return true;
  const { own, opp } = teamsOf(deps, player);
  const ctx: StandUpRollContext = {
    player,
    teammates: own.players.filter((p) => p.id !== player.id && p.gridPosition),
    opponents: opp.players.filter((p) => p.gridPosition),
    modifiers: 0,
    triggers: [],
  };
  await foldTrigger("onStandUpRoll", [player], ctx);
  for (const t of ctx.triggers) {
    deps.eventBus.emit(GameEventNames.SkillTriggered, t);
  }
  const check = deps.diceController.rollSkillCheck(
    "Stand Up",
    4,
    ctx.modifiers,
    player.playerName
  );
  return check.success;
}

/**
 * Declares a Rush, lets rules modify it (Drunkard), and rolls it. A failed
 * Rush may be rerolled (Sure Feet, team reroll).
 */
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
      "Rush",
      2,
      rushCtx.modifiers,
      player.playerName
    );
  return gameService
    ? withRerollOffer({ gameService, eventBus }, player, "rush", roll)
    : roll();
}

/**
 * The mover, already Prone, has Fallen Over: a ball on their square
 * Bounces, they roll Armour, and it is a Turnover.
 */
export function fallOver(
  { eventBus, callbacks }: MovementDeps,
  fall: {
    player: Player;
    square: Square;
    ballBounces: boolean;
    context: FlowContext | undefined;
    /** For a failed Dodge, the square left, so Arm Bar markers react. */
    vacatedSquare?: Square;
    reason: string;
  }
): void {
  const { player, square, context } = fall;
  eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
  eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  if (fall.ballBounces && context?.flowManager) {
    context.gameService.setBallPosition(square.x, square.y);
    context.flowManager.add(new BounceOperation(square), true);
  }
  if (context?.flowManager) {
    context.flowManager.add(
      fall.vacatedSquare
        ? new ArmourOperation(player.id, undefined, {
            cause: "dodge",
            vacatedSquare: fall.vacatedSquare,
          })
        : new ArmourOperation(player.id),
      true
    );
  }
  callbacks.onTurnover(fall.reason);
}

/**
 * Diving Tackle: the diver is placed Prone in the square the mover left
 * (no Armour Roll, placed rather than Knocked Down). The mover must be in
 * `landing` before the diver takes `vacated`, so the two never share it.
 */
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

/**
 * Treacherous Trapdoor (L12): the player falls through and is injured
 * exactly as if Pushed into the Crowd; a ball they carried Bounces from
 * the Trapdoor. As with a crowd push, it is a Turnover.
 */
export function dropThroughTrapdoor(
  { state, eventBus, callbacks }: MovementDeps,
  player: Player,
  square: Square,
  holdingBall: boolean,
  flowManager?: GameFlowManager
): void {
  if (holdingBall) {
    state.ballPosition = { ...square };
    eventBus.emit(GameEventNames.BallPlaced, { ...square });
  }
  player.gridPosition = undefined;
  flowManager?.add(
    new CrowdInjuryOperation(player.id, { ...square }, false, {
      carriedBall: holdingBall,
    }),
    true
  );
  callbacks.onTurnover("Fell through a Trapdoor");
}
