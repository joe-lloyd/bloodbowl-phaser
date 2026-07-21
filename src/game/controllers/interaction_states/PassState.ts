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
    // Draw pass line — the target is the hovered square's centre, so the
    // previewed Range Ruler matches the one used at resolution.
    const player = this.gameService.getPlayerById(this.playerId);
    if (player && player.gridPosition) {
      const passController = this.gameService.getPassController();
      const passRange = passController.measureRange(player.gridPosition, {
        x,
        y,
      });
      this.controller
        .getPitch()
        .drawPassLine(player.gridPosition, { x, y }, passRange.type);

      // Preview the interception corridor for a pass landing on this square:
      // the whole zone a player could intercept from, plus the squares where
      // a standing opponent actually threatens the throw (same geometry the
      // pass resolution uses).
      const opponents = this.gameService.getOpponents(player.teamId);
      const zone = passController.getInterceptionSquares(player.gridPosition, {
        x,
        y,
      });
      const threats = passController
        .checkInterceptions(player.gridPosition, { x, y }, opponents, true)
        .map((i) => i.position);
      this.controller
        .getPitch()
        .drawInterceptZone(player.gridPosition, { x, y }, zone, threats);
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
