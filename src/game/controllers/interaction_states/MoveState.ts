import { BaseInteractionState } from "./InteractionState";
import { GameEventNames } from "../../../types/events";

export class MoveInteractionState extends BaseInteractionState {
  private waypoints: { x: number; y: number }[] = [];

  constructor(
    controller: any,
    gameService: any,
    eventBus: any,
    private playerId: string
  ) {
    super(controller, gameService, eventBus);
  }

  enter(): void {
    this.eventBus.emit(GameEventNames.UI_Notification, "Move Mode Active");
    // Visualize range
    this.refreshVisualization();
  }

  exit(): void {
    this.controller.getPitch().clearPath();
    this.controller.getPitch().clearHighlights();
  }

  async handleSquareClick(x: number, y: number): Promise<void> {
    // Same logic as old controller:
    // If clicking last waypoint -> Confirm
    // Else -> Add waypoint

    const lastPos =
      this.waypoints.length > 0
        ? this.waypoints[this.waypoints.length - 1]
        : this.gameService.getPlayerById(this.playerId)!.gridPosition!;

    if (lastPos.x === x && lastPos.y === y) {
      // Confirm Move
      // this.controller.executeMove(this.playerId, this.waypoints); // Extracted method on controller?
      // Or we handle it here if we expose movement logic?
      // For this refactor, let's say executeMove is on Controller or we invoke Service directly.
      // Using Controller helper for now to keep logic common.
      await this.controller.executeMove(this.playerId, this.waypoints);
    } else {
      this.addWaypoint(x, y);
    }
  }

  private addWaypoint(x: number, y: number): void {
    // Reuse pathfinding logic logic from Controller (or move it to a helper/MovementManager)
    // Ideally MovementManager.findPath
    // this.controller.addWaypointLogic(...)
    // For brevity in this file prompt, assume we call back to controller helper
    const newPath = this.controller.calculatePath(
      this.playerId,
      this.waypoints,
      { x, y }
    );
    if (newPath) {
      this.waypoints.push(...newPath);
      this.controller.drawPath(this.playerId, this.waypoints);
    }
  }

  private refreshVisualization(): void {
    // Draw range overlay
    this.controller.drawRangeOverlay(this.playerId);
  }
}
