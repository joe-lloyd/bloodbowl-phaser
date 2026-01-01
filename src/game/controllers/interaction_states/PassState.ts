import { BaseInteractionState } from "./InteractionState";
import { GameEventNames } from "../../../types/events";

export class PassInteractionState extends BaseInteractionState {
  constructor(
    controller: any,
    gameService: any,
    eventBus: any,
    private playerId: string
  ) {
    super(controller, gameService, eventBus);
  }

  enter(): void {
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      "Select Target for Pass"
    );
    // Show ranges
    this.refreshVisualization();
  }

  exit(): void {
    this.controller.getPitch().clearPassVisualization();
  }

  async handleSquareClick(x: number, y: number): Promise<void> {
    // Execute Pass
    // 1. Check valid target (optional, valid square?)
    // 2. Call Service to start pass operation

    await this.gameService.throwBall(this.playerId, x, y);
    // Note: throwBall success/fail usually ends activation or waits for animation.
    // We should switch back to DefaultState immediately or wait?
    // Usually throwing ends the action for input purposes (user watches animation).
    this.controller.deselectPlayer();
  }

  handleSquareHover(x: number, y: number): void {
    super.handleSquareHover(x, y);
    // Draw pass line
    const player = this.gameService.getPlayerById(this.playerId);
    if (player && player.gridPosition) {
      const passRange = this.gameService
        .getPassController()
        .measureRange(player.gridPosition, { x, y });
      this.controller
        .getPitch()
        .drawPassLine(player.gridPosition, { x, y }, passRange.type);
    }
  }

  private refreshVisualization(): void {
    const player = this.gameService.getPlayerById(this.playerId);
    if (player && player.gridPosition) {
      const ranges = this.gameService
        .getPassController()
        .getAllRanges(player.gridPosition);
      this.controller.getPitch().drawPassZones(player.gridPosition, ranges);
    }
  }
}
