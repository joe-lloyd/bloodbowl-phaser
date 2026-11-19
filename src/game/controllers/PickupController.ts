import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { type Player } from "@/types/Player";
import type { DiceController } from "./DiceController";

export class PickupController {
  private eventBus: IEventBus;
  private diceController: DiceController;
  constructor(eventBus: IEventBus, diceController: DiceController) {
    this.eventBus = eventBus;
    this.diceController = diceController;
  }

  public attemptPickup(
    player: Player,
    standingEnemies: number,
    weatherModifier = 0
  ): { success: boolean; roll: number } {
    const target = player.stats.AG;

    const modifier = -standingEnemies + weatherModifier;

    const d6 = this.diceController.rollD6("Agility (Pickup)");

    const finalRoll = d6 + modifier;
    const success = d6 !== 1 && (d6 === 6 || finalRoll >= target);

    this.eventBus.emit(GameEventNames.BallPickup, {
      playerId: player.id,
      success,
      roll: d6,
      target,
    });

    return { success, roll: d6 };
  }
}
