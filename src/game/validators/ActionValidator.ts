import { type Player } from "@/types/Player";

type ActionType = "block" | "blitz" | "foul" | "pass" | "handoff";

export interface ActionResult {
  valid: boolean;
  reason?: string;
}

export class ActionValidator {
  public validateAction(
    ...[actionType, actor, target]:
      | ["block", Player, Player]
      | ["pass", Player, { x: number; y: number }]
      | [
          Exclude<ActionType, "block" | "pass">,
          Player,
          Player | { x: number; y: number },
        ]
  ): ActionResult {
    switch (actionType) {
      case "block":
        return this.validateBlock(actor, target);
      case "pass":
      case "blitz":
      case "foul":
      case "handoff":
        return { valid: true };
    }
  }

  private validateBlock(actor: Player, target: Player): ActionResult {
    const from = actor.gridPosition ?? { x: 0, y: 0 };
    const to = target.gridPosition ?? { x: 0, y: 0 };
    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);

    if (dx > 1 || dy > 1) {
      return { valid: false, reason: "Target is not adjacent" };
    }

    return { valid: true };
  }
}
