import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { GameEventNames } from "../../types/events";
import { FoulOperation } from "./FoulOperation";

export class PileDriverOperation extends GameOperation {
  public readonly name = "PileDriverOperation";

  constructor(
    private attackerId: string,
    private defenderId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const attacker = context.gameService.getPlayerById(this.attackerId);
    const defender = context.gameService.getPlayerById(this.defenderId);
    if (
      !attacker?.gridPosition ||
      attacker.status !== PlayerStatus.ACTIVE ||
      !defender?.gridPosition ||
      (defender.status !== PlayerStatus.PRONE &&
        defender.status !== PlayerStatus.STUNNED)
    ) {
      return;
    }
    const adjacent =
      Math.max(
        Math.abs(attacker.gridPosition.x - defender.gridPosition.x),
        Math.abs(attacker.gridPosition.y - defender.gridPosition.y)
      ) === 1;
    if (!adjacent) return;

    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.PILE_DRIVER,
      effect: "Pile Driver: performs a free Foul, then is Placed Prone",
    });
    await new FoulOperation(
      attacker.id,
      defender.gridPosition.x,
      defender.gridPosition.y
    ).execute(context);

    if (attacker.status === PlayerStatus.ACTIVE) {
      attacker.status = PlayerStatus.PRONE;
      context.eventBus.emit(GameEventNames.PlayerStatusChanged, attacker);
    }
    context.gameService.finishActivation(attacker.id);
    if (context.gameService.getState().activePlayer?.id === attacker.id) {
      context.gameService.getState().activePlayer = null;
    }
  }
}
