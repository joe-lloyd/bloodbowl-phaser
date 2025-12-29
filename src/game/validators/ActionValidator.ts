import { Player } from "@/types/Player";

export type ActionType = "block" | "blitz" | "foul" | "pass" | "handoff";

export interface ActionResult {
  valid: boolean;
  reason?: string;
}

export class ActionValidator {
  /**
   * validateAction
   */
  public validateAction(
    actionType: ActionType,
    actor: Player,
    target: Player | { x: number; y: number }
  ): ActionResult {
    switch (actionType) {
      case "block":
        return this.validateBlock(actor, target as Player);
      case "pass":
        return this.validatePass(actor, target as { x: number; y: number });
      default:
        return { valid: true };
    }
  }

  private validateBlock(actor: Player, target: Player): ActionResult {
    // Must be adjacent
    const dx = Math.abs(
      (actor.gridPosition?.x || 0) - (target.gridPosition?.x || 0)
    );
    const dy = Math.abs(
      (actor.gridPosition?.y || 0) - (target.gridPosition?.y || 0)
    );

    if (dx > 1 || dy > 1) {
      return { valid: false, reason: "Target is not adjacent" };
    }

    // Target must be standing? (Block vs Foul)
    if (target.status !== "Active" && target.status !== "Stunned") {
      // Simplified status check
      // Implementation detail: check if target is Down
    }

    return { valid: true };
  }

  private validatePass(
    actor: Player,
    target: { x: number; y: number }
  ): ActionResult {
    // Range check would go here
    return { valid: true };
  }
}
