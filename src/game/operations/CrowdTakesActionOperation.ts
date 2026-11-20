import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "../../types/Player";
import { stallingHitsOn } from "../rules/stalling";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { activeRules } from "../variants/activeMatch";
import { ArmourOperation } from "./ArmourOperation";
import { BounceOperation } from "./BounceOperation";
import { InjuryOperation } from "./InjuryOperation";

interface Square {
  x: number;
  y: number;
}

export class CrowdTakesActionOperation extends GameOperation {
  public readonly name = "CrowdTakesAction";

  private playerId: string;
  private then: () => void;
  constructor(playerId: string, then: () => void) {
    super();
    this.playerId = playerId;
    this.then = then;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService } = context;
    const player = gameService.getPlayerById(this.playerId);
    const square = player?.gridPosition && { ...player.gridPosition };
    if (player && square && this.crowdHits(context, player)) {
      await this.punish(context, player, square);
    }
    this.then();
  }

  private crowdHits(context: FlowContext, player: Player): boolean {
    const { gameService, eventBus } = context;
    const hitsOn = stallingHitsOn(
      activeRules().stallingPenalty,
      gameService.getState().turn.turnNumber
    );
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} is Stalling! The crowd hits on a ${String(hitsOn)}+`
    );
    const roll = gameService
      .getDiceController()
      .rollD6(`Crowd Takes Action (${player.playerName})`, player.teamId);
    return roll >= hitsOn;
  }

  private async punish(
    context: FlowContext,
    player: Player,
    square: Square
  ): Promise<void> {
    const { gameService, eventBus, flowManager } = context;
    const bottle = activeRules().stallingPenalty === "bottle";
    eventBus.emit(
      GameEventNames.UI_Notification,
      bottle
        ? `A bottle hits ${player.playerName}!`
        : `The crowd pelts ${player.playerName}!`
    );
    if (
      !bottle &&
      (await steadyFootingSaves(
        player,
        gameService.getDiceController(),
        eventBus,
        gameService
      ))
    ) {
      return;
    }
    const ball = groundBall(gameService.getState());
    const carried = ball?.x === square.x && ball.y === square.y;
    player.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);

    await flowManager.runToRest(
      bottle
        ? new InjuryOperation(player.id, { cause: "special" })
        : new ArmourOperation(player.id, undefined, undefined, "special")
    );
    if (carried) await flowManager.runToRest(new BounceOperation(square));
    gameService.triggerTurnover("The Crowd Takes Action");
  }
}
