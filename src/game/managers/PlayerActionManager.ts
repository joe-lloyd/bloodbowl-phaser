import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { ActionType, GameEventNames } from "@/types/events";
import { BlockReplacement } from "@/types/BlockReplacement";
import { Player } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { foulSpent } from "../inducements/matchInducements";

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
    private state: GameState,
    private getPlayer: (id: string) => Player | undefined
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
      // A second Foul this turn can only be the team's Grudge Match (L24).
      ...(action === "foul" && this.state.turn.hasFouled
        ? { grudgeMatch: true }
        : {}),
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
    this.updateTurnFlags(active.action, playerId);
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
      case "foul": {
        const fouler = this.getPlayer(playerId);
        if (!fouler || foulSpent(this.state, fouler.teamId)) return false;
        break;
      }
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
        // "Only a single Throw Team-mate Action can be declared each Turn"
        // (p.55); a Kick Team-mate is its own once-per-Turn Special Action
        // (p.131). Neither is a Pass.
        if (!this.teamMateThrowLimit(playerId)) return false;
        break;
      case "throwBomb":
        // Bombardier: "only one player can declare this Special Action
        // each Turn" (p.125).
        if (turn.hasThrownBomb) return false;
        break;
    }

    return true;
  }

  /** Which unspent once-per-Turn limit this player's declaration uses. */
  private teamMateThrowLimit(
    playerId: string
  ): "hasThrownTeamMate" | "hasKickedTeamMate" | null {
    const player = this.getPlayer(playerId);
    const turn = this.state.turn;
    if (!player) return null;
    if (
      hasSkill(player.skills, SkillType.THROW_TEAM_MATE) &&
      !turn.hasThrownTeamMate
    ) {
      return "hasThrownTeamMate";
    }
    if (
      hasSkill(player.skills, SkillType.KICK_TEAM_MATE) &&
      !turn.hasKickedTeamMate
    ) {
      return "hasKickedTeamMate";
    }
    return null;
  }

  private updateTurnFlags(
    action: ActionType | string | null,
    playerId: string
  ): void {
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
      case "throwTeamMate": {
        const limit = this.teamMateThrowLimit(playerId);
        if (limit) turn[limit] = true;
        break;
      }
      case "throwBomb":
        turn.hasThrownBomb = true;
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
        return "Move onto the loose ball, then pick it up on a 2+. Ends the activation.";
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
