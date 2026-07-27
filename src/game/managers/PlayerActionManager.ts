import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { ActionType, GameEventNames } from "@/types/events";
import { BlockReplacement } from "@/types/BlockReplacement";

/** Which term made a declaration binding — used to name a refusal. */
export type CommitReason =
  | "movement"
  | "blockReplacement"
  | "activated"
  | "gate";

export interface CommitStatus {
  committed: boolean;
  reason?: CommitReason;
}

export class PlayerActionManager {
  constructor(
    private eventBus: IEventBus,
    private state: GameState
  ) {}

  /**
   * Attempt to declare an action for a player
   */
  public declareAction(
    playerId: string,
    action: ActionType,
    blockReplacement?: BlockReplacement
  ): boolean {
    // Validation
    if (!this.canDeclareAction(playerId, action)) {
      return false;
    }

    // Set State — provisional until committed (see commitAction). The
    // team's once-per-turn flag is NOT set here; declaring an action must
    // not spend it before a die is rolled, a square is moved, or the
    // activation gate fires.
    this.state.activePlayer = {
      id: playerId,
      action: action,
      ...(blockReplacement
        ? { blockReplacement, blockReplacementUsed: false }
        : {}),
    };

    // Emit Event
    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Action Declared: ${action.toUpperCase()}`
    );
    // We might want a specific event for "Action Declared" to update UI

    return true;
  }

  /**
   * Whether the live declaration for this player is binding: movement
   * spent, a block-replacement attack spent, the player already marked
   * activated, or the activation gate has fired. The single predicate every
   * release/redeclare/refusal path consults, so they can never drift apart.
   */
  public isActionCommitted(playerId: string): CommitStatus {
    const active = this.state.activePlayer;
    if (!active || active.id !== playerId) return { committed: false };
    if ((this.state.turn.movementUsed.get(playerId) ?? 0) > 0) {
      return { committed: true, reason: "movement" };
    }
    if (active.blockReplacementUsed) {
      return { committed: true, reason: "blockReplacement" };
    }
    if (this.state.turn.activatedPlayerIds.has(playerId)) {
      return { committed: true, reason: "activated" };
    }
    if (active.committed) {
      return { committed: true, reason: "gate" };
    }
    return { committed: false };
  }

  /** Human-readable refusal text for a commit reason. */
  public static describeCommitReason(reason: CommitReason): string {
    switch (reason) {
      case "movement":
        return "movement already used";
      case "blockReplacement":
        return "attack already spent";
      case "activated":
        return "already activated";
      case "gate":
        return "dice already rolled";
    }
  }

  /**
   * Commit the currently declared action for this player: the once-per-turn
   * flag is set (if the action carries one) and the declaration becomes
   * binding. Idempotent — safe to call from every trigger point (movement,
   * block-replacement spend, activation gate roll, activation finalized)
   * without checking which one actually fired first.
   */
  public commitAction(playerId: string): void {
    const active = this.state.activePlayer;
    if (!active || active.id !== playerId || active.committed) return;
    active.committed = true;
    this.updateTurnFlags(active.action);
  }

  /**
   * Cancel an uncommitted declaration. Once movement or the replacement
   * attack has committed, the team action remains spent.
   */
  public cancelAction(playerId: string): boolean {
    const active = this.state.activePlayer;
    if (!active || active.id !== playerId) return false;
    if (this.isActionCommitted(playerId).committed) return false;

    this.state.activePlayer = null;
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
      case "punt":
        break;
      case "handoff":
        if (turn.hasHandedOff) return false;
        break;
      case "foul":
        if (turn.hasFouled) return false;
        break;
      case "move":
      case "block":
      case "multipleBlock":
      case "standUp":
      case "secureBall":
      case "forgoe":
      case "special":
      case "stab":
      case "breatheFire":
      case "vomit":
      case "gaze":
      case "chomp":
      case "chainsaw":
        // Always allowed if general activation is allowed (Stab: "there is
        // no limit to the number of players that can declare this Special
        // Action each Turn")
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

  private updateTurnFlags(action: ActionType | string | null): void {
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
    // Emit event to update UI
    this.emitTurnFlags();
  }

  private emitTurnFlags(): void {
    this.eventBus.emit(GameEventNames.TurnDataUpdated, {
      hasBlitzed: this.state.turn.hasBlitzed,
      hasPassed: this.state.turn.hasPassed,
      hasHandedOff: this.state.turn.hasHandedOff,
      hasFouled: this.state.turn.hasFouled,
    });
  }

  public getActionDescription(action: ActionType): string {
    switch (action) {
      case "move":
        return "Move up to MA. May Sprint (+2).";
      case "blitz":
        return "Move and Block (1/Turn). Block costs 1 MA.";
      case "block":
        return "Block an adjacent enemy.";
      case "multipleBlock":
        return "Block two adjacent enemies at -2 Strength; no Follow-up.";
      case "pass":
        return "Move and Pass ball (1/Turn).";
      case "punt":
        return "Move, then kick the carried ball using the Throw-in Template.";
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
