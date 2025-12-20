import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { ActionType } from "@/types/events";
import { Player, PlayerStatus } from "@/types/Player";

export class PlayerActionManager {
  constructor(private eventBus: IEventBus, private state: GameState) {}

  /**
   * Attempt to declare an action for a player
   */
  public declareAction(playerId: string, action: ActionType): boolean {
    // Validation
    if (!this.canDeclareAction(playerId, action)) {
      return false;
    }

    // Set State
    this.state.activePlayer = {
      id: playerId,
      action: action,
    };

    // Update Turn Flags
    this.updateTurnFlags(action);

    // Emit Event
    this.eventBus.emit(
      "ui:notification",
      `Action Declared: ${action.toUpperCase()}`
    );
    // We might want a specific event for "Action Declared" to update UI

    return true;
  }

  /**
   * Check if an action can be declared
   */
  public canDeclareAction(playerId: string, action: ActionType): boolean {
    const turn = this.state.turn;

    // Basic checks (is active team, etc - assumed handled by caller or GameService)

    switch (action) {
      case "blitz":
        if (turn.hasBlitzed) return false;
        break;
      case "pass":
        if (turn.hasPassed) return false;
        break;
      case "handoff":
        if (turn.hasHandedOff) return false;
        break;
      case "foul":
        if (turn.hasFouled) return false;
        break;
      case "move":
      case "block":
      case "standUp":
      case "secureBall":
      case "forgoe":
      case "special":
        // Always allowed if general activation is allowed
        break;
      case "throwTeamMate":
        // Check if player has Right Stuff / Throw Team Mate traits (TODO)
        // Also counts as Pass action usually? Or separate?
        // BB2020: Throw Team Mate is a Special Action.
        // "A team may only use this action once per turn."
        // It usually consumes the Pass action for the turn?
        // Rule check: "A team may not use a Pass action and a Throw Team-mate action in the same turn."
        if (turn.hasPassed) return false;
        break;
    }

    return true;
  }

  private updateTurnFlags(action: ActionType): void {
    const turn = this.state.turn;
    switch (action) {
      case "blitz":
        turn.hasBlitzed = true;
        break;
      case "pass":
        turn.hasPassed = true;
        break;
      case "handoff":
        turn.hasHandedOff = true;
        break;
      case "foul":
        turn.hasFouled = true;
        break;
      case "throwTeamMate":
        turn.hasPassed = true; // Consumes pass?
        break;
    }
    this.eventBus.emit("turnDataUpdated", turn);
  }

  public getActionDescription(action: ActionType): string {
    switch (action) {
      case "move":
        return "Move up to MA. May Sprint (+2).";
      case "blitz":
        return "Move and Block (1/Turn). Block costs 1 MA.";
      case "block":
        return "Block an adjacent enemy.";
      case "pass":
        return "Move and Pass ball (1/Turn).";
      case "handoff":
        return "Move and Handoff ball (1/Turn).";
      case "foul":
        return "Move and Foul downed enemy (1/Turn).";
      case "secureBall":
        return "Move to ball. +1 to Pickup if ending move on ball."; // Custom rule?
      case "standUp":
        return "Stand up (Costs 3 MA).";
      case "throwTeamMate":
        return "Throw adjacent Right Stuff teammate.";
      case "forgoe":
        return "End activation immediately.";
      default:
        return "";
    }
  }
}
