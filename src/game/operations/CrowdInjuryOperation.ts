/**
 * CrowdInjuryOperation - Injury by the Crowd (rulebook p.68).
 *
 * A player pushed into the crowd takes an immediate injury roll with NO
 * armour roll. A Stunned result places them in the Reserves box instead of
 * on the pitch. If they carried the ball it is thrown in from the square
 * they exited (p.73), and an active-team player surfing causes a turnover
 * (absorbed by the turnover latch if one is already resolving).
 */

import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";
import { InjuryResult } from "../controllers/InjuryController";
import { CasualtyOperation } from "./CasualtyOperation";

export class CrowdInjuryOperation extends GameOperation {
  public readonly name = "CrowdInjury";

  constructor(
    private playerId: string,
    private exitSquare: { x: number; y: number },
    /**
     * Whether this surf is a turnover, decided when the push happened —
     * by resolution time the activation may already have ended the turn,
     * so the active team can no longer be read from the game state.
     */
    private isTurnover: boolean
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;

    // Ball carried off the pitch is thrown back in before injury drama
    const state = gameService.getState();
    const carriedBall =
      state.ballPosition &&
      state.ballPosition.x === this.exitSquare.x &&
      state.ballPosition.y === this.exitSquare.y;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName} is pushed into the crowd!`
    );
    await context.delay(800);

    // Injury by the Crowd: straight to the injury roll, no armour roll
    const roll = gameService
      .getDiceController()
      .roll2D6(`Injury by the Crowd (${player.playerName})`);
    const result = gameService.getInjuryController().getInjuryResult(
      player,
      roll
    );

    switch (result) {
      case InjuryResult.STUNNED:
        // Stunned by the crowd = dumped in the Reserves box instead
        eventBus.emit(
          GameEventNames.UI_Notification,
          "Thrown back to the reserves!"
        );
        player.status = PlayerStatus.RESERVE;
        break;
      case InjuryResult.KO:
        eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");
        player.status = PlayerStatus.KO;
        break;
      case InjuryResult.CASUALTY:
        eventBus.emit(GameEventNames.UI_Notification, "CASUALTY!");
        player.status = PlayerStatus.INJURED;
        flowManager.add(new CasualtyOperation(this.playerId), true);
        break;
    }
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    await context.delay(600);

    if (carriedBall) {
      gameService.throwInBall(this.exitSquare);
    }

    // Active-team player surfed = turnover (latch absorbs duplicates)
    if (this.isTurnover) {
      gameService.triggerTurnover("Pushed into the Crowd");
    }
  }
}
