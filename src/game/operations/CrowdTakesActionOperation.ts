import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { crowdHits } from "../rules/stalling";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";

/**
 * The Crowd Takes Action (2025 rulebook p.80): "roll a D6 at the end of the
 * Stalling player's activation. If the score on the D6 is equal to or
 * greater than the team's current Turn number, then the Stalling player is
 * hit by some form of projectile thrown by the crowd and is immediately
 * Knocked Down. This will cause a Turnover." `then` finishes the
 * activation, or the turn, the roll came at the end of.
 */
export class CrowdTakesActionOperation extends GameOperation {
  public readonly name = "CrowdTakesAction";

  constructor(
    private playerId: string,
    private then: () => void
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const player = gameService.getPlayerById(this.playerId);
    const square = player?.gridPosition && { ...player.gridPosition };
    if (player && square) {
      const turn = gameService.getState().turn.turnNumber;
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} is Stalling! The crowd hits on a ${turn}+`
      );
      const roll = gameService
        .getDiceController()
        .rollD6(`Crowd Takes Action (${player.playerName})`, player.teamId);
      if (crowdHits(roll, turn)) {
        eventBus.emit(
          GameEventNames.UI_Notification,
          `The crowd pelts ${player.playerName}!`
        );
        if (
          await steadyFootingSaves(
            player,
            gameService.getDiceController(),
            eventBus,
            gameService
          )
        ) {
          this.then();
          return;
        }
        const ball = groundBall(gameService.getState());
        const carried = ball?.x === square.x && ball.y === square.y;
        player.status = PlayerStatus.PRONE;
        eventBus.emit(GameEventNames.PlayerKnockedDown, {
          playerId: player.id,
        });
        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        // Knocked Down: the Armour Roll, then the carried ball Bounces
        await flowManager.runToRest(
          new ArmourOperation(player.id, undefined, undefined, "special")
        );
        if (carried) await flowManager.runToRest(new BounceOperation(square));
        gameService.triggerTurnover("The Crowd Takes Action");
      }
    }
    this.then();
  }
}
