import { BaseInteractionState } from "./InteractionState";
import { GameEventNames } from "../../../types/events";

export class DefaultInteractionState extends BaseInteractionState {
  enter(): void {
    this.controller.deselectPlayer();
    this.controller.getPitch().clearHighlights();
    this.controller.getPitch().clearPath();
  }

  exit(): void {
    // Nothing specific
  }

  async handleSquareClick(x: number, y: number): Promise<void> {
    const player = this.controller.getPlayerAt(x, y);

    if (player) {
      // Select player -> Switch to MoveState (or just Selected state)
      // For now, we keep it simple: Select player and effectively enter "Move Planning" mode if it's their turn
      this.controller.selectPlayer(player.id);
    } else {
      this.controller.deselectPlayer();
    }
  }
}
