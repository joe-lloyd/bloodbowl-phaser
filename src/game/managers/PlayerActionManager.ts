import { type IEventBus } from "../../services/EventBus";
import { type GameState } from "@/types/GameState";
import { type ActionType, GameEventNames } from "@/types/events";
import { type BlockReplacement } from "@/types/BlockReplacement";
import { type Player } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { foulSpent, spendMeasure } from "../inducements/matchInducements";
import { DesperateMeasure } from "../inducements/desperateMeasures";

export type CommitReason =
  | "movement"
  | "blockReplacement"
  | "activated"
  | "gate";

export type CommitStatus =
  | { committed: false }
  | { committed: true; reason: CommitReason };

export class PlayerActionManager {
  private eventBus: IEventBus;
  private state: GameState;
  private getPlayer: (id: string) => Player | undefined;
  constructor(
    eventBus: IEventBus,
    state: GameState,
    getPlayer: (id: string) => Player | undefined
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.getPlayer = getPlayer;
  }

  public declareAction(
    playerId: string,
    action: ActionType,
    blockReplacement?: BlockReplacement
  ): boolean {
    if (!this.canDeclareAction(playerId, action)) {
      return false;
    }

    this.state.activePlayer = {
      id: playerId,
      action: action,

      ...(action === "foul" && this.state.turn.hasFouled
        ? { grudgeMatch: true }
        : {}),
      ...(blockReplacement
        ? { blockReplacement, blockReplacementUsed: false }
        : {}),
    };

    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Action Declared: ${action.toUpperCase()}`
    );

    return true;
  }

  public isActionCommitted(playerId: string): CommitStatus {
    const active = this.state.activePlayer;
    if (active?.id !== playerId) return { committed: false };

    if (this.movedSinceDeclaration(active)) {
      return { committed: true, reason: "movement" };
    }
    if (active.blockReplacementUsed) {
      return { committed: true, reason: "blockReplacement" };
    }
    if (this.state.turn.activatedPlayerIds.has(playerId)) {
      return { committed: true, reason: "activated" };
    }
    if (active.committed || active.activationRollStarted) {
      return { committed: true, reason: "gate" };
    }
    return { committed: false };
  }

  private movedSinceDeclaration(active: NonNullable<GameState["activePlayer"]>): boolean {
    const used = this.state.turn.movementUsed.get(active.id) ?? 0;
    return used > (active.razzleDazzle?.movementBefore ?? 0);
  }

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

  public commitAction(playerId: string): void {
    const active = this.state.activePlayer;
    if (!active || active.id !== playerId || active.committed) return;
    active.committed = true;

    const player = this.getPlayer(playerId);
    if (active.razzleDazzle?.actions.length === 1 && player) {
      spendMeasure(this.state, player.teamId, DesperateMeasure.RAZZLE_DAZZLE);
    }
    this.updateTurnFlags(active.action, playerId);
  }

  public cancelAction(playerId: string): boolean {
    const active = this.state.activePlayer;
    if (!active || active.id !== playerId) return false;
    if (active.razzleDazzle?.awaitingSecond) return false;
    if (this.isActionCommitted(playerId).committed) return false;

    const razzle = active.razzleDazzle;
    const firstAction = razzle?.actions[0];
    if (razzle && razzle.actions.length === 2 && firstAction) {
      this.state.activePlayer = {
        id: playerId,
        action: firstAction,
        ...(active.bloodlustUnsated ? { bloodlustUnsated: true } : {}),
        committed: true,
        razzleDazzle: { actions: [firstAction], awaitingSecond: true },
      };
      return true;
    }
    this.state.activePlayer = null;
    return true;
  }

  public canDeclareAction(playerId: string, action: ActionType): boolean {
    const turn = this.state.turn;

    switch (action) {
      case "blitz":
        return !turn.hasBlitzed;
      case "pass":
        return !turn.hasPassed;
      case "handoff":
        return !turn.hasHandedOff;
      case "foul": {
        const fouler = this.getPlayer(playerId);
        return !!fouler && !foulSpent(this.state, fouler.teamId);
      }
      case "throwTeamMate":
        return this.teamMateThrowLimit(playerId) !== null;
      case "throwBomb":
        return !turn.hasThrownBomb;
      default:
        return true;
    }
  }

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
      case "throwTeamMate":
        return "Throw adjacent Right Stuff teammate.";
      case "forgoe":
        return "End activation immediately.";
      default:
        return "";
    }
  }
}
