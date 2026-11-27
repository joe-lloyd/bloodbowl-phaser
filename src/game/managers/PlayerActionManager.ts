import { type IEventBus } from "../../services/EventBus";
import { type GameState } from "@/types/GameState";
import { type ActionType, GameEventNames } from "@/types/events";
import { type BlockReplacement } from "@/types/BlockReplacement";
import { type Player } from "@/types/Player";
import { playerById, type Seating } from "../seating";
import {
  type Declaration,
  maySpend,
  spend,
  targetOf,
} from "../rules/turnSpend";
import { SkillType, hasSkill } from "@/types/Skills";
import { foulSpent, spendMeasure } from "../inducements/matchInducements";
import { mustRedeclare } from "../rules/awaitingDeclaration";
import { DesperateMeasure } from "../inducements/desperateMeasures";

export type CommitReason =
  | "movement"
  | "blockReplacement"
  | "activated"
  | "gate";

export type CommitStatus =
  | { committed: false }
  | { committed: true; reason: CommitReason };

export function openActivation(
  active: NonNullable<GameState["activePlayer"]>
): NonNullable<GameState["activePlayer"]> {
  return {
    id: active.id,
    action: null,
    squigRageSettled: true,
    ...(active.stalling !== undefined && { stalling: active.stalling }),
  };
}

type ActivePlayer = NonNullable<GameState["activePlayer"]>;

interface DeclarationChoices {
  blockReplacement?: BlockReplacement | undefined;
  against?: string | undefined;
}

export class PlayerActionManager {
  private eventBus: IEventBus;
  private state: GameState;
  private seating: Seating;
  constructor(eventBus: IEventBus, state: GameState, seating: Seating) {
    this.eventBus = eventBus;
    this.state = state;
    this.seating = seating;
  }

  private getPlayer(id: string): Player | undefined {
    return playerById(this.seating, id);
  }

  public declareAction(
    playerId: string,
    action: ActionType,
    { blockReplacement, against }: DeclarationChoices = {}
  ): boolean {
    if (!this.canDeclareAction(playerId, action, against)) {
      return false;
    }
    const foul = action === "foul" && this.declarationOf(playerId, action, against);

    this.state.activePlayer = {
      id: playerId,
      action: action,

      ...(foul && !maySpend(this.state.turn.spend, foul) && { grudgeMatch: true }),
      ...(blockReplacement && { blockReplacement, blockReplacementUsed: false }),
      ...(against !== undefined && { against }),
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
    this.updateTurnFlags(active);
  }

  public cancelAction(playerId: string): boolean {
    const active = this.state.activePlayer;
    if (!active || active.id !== playerId) return false;
    if (active.razzleDazzle?.awaitingSecond) return false;
    if (mustRedeclare(this.state, playerId)) return false;
    if (this.isActionCommitted(playerId).committed) return false;
    if (active.squigRageSettled) {
      this.state.activePlayer = openActivation(active);
      return true;
    }

    const razzle = active.razzleDazzle;
    const firstAction = razzle?.actions[0];
    if (razzle && razzle.actions.length === 2 && firstAction) {
      this.state.activePlayer = {
        id: playerId,
        action: firstAction,
        ...(active.bloodlustUnsated && { bloodlustUnsated: true }),
        committed: true,
        razzleDazzle: { actions: [firstAction], awaitingSecond: true },
      };
      return true;
    }
    this.state.activePlayer = null;
    return true;
  }

  public canDeclareAction(
    playerId: string,
    action: ActionType,
    against?: string
  ): boolean {
    switch (action) {
      case "blitz":
      case "pass":
      case "handoff":
      case "foul": {
        const declaration = this.declarationOf(playerId, action, against);
        return !!declaration && this.mayDeclare(playerId, declaration);
      }
      case "throwTeamMate":
        return this.teamMateThrowLimit(playerId) !== null;
      case "throwBomb":
        return !this.state.turn.hasThrownBomb;
      default:
        return true;
    }
  }

  private teamMateThrowLimit(
    playerId: string
  ): "hasThrownTeamMate" | "hasKickedTeamMate" | null {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    const turn = this.state.turn;
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

  private mayDeclare(playerId: string, declaration: Declaration): boolean {
    if (declaration.kind !== "foul") {
      return maySpend(this.state.turn.spend, declaration);
    }
    const fouler = this.getPlayer(playerId);
    return !!fouler && !foulSpent(this.state, fouler.teamId, declaration.against);
  }

  private declarationOf(
    playerId: string,
    action: ActionType | null,
    against: string | undefined
  ): Declaration | undefined {
    if (action === "pass" || action === "handoff") return { kind: action };
    if (action !== "blitz" && action !== "foul") return undefined;
    const mover = this.getPlayer(playerId);
    const target = mover && targetOf(this.seating, mover.teamId, against);
    return target === undefined ? undefined : { kind: action, against: target };
  }

  private updateTurnFlags(active: ActivePlayer): void {
    const turn = this.state.turn;
    const declaration = this.declarationOf(active.id, active.action, active.against);
    if (declaration) turn.spend = spend(turn.spend, declaration);
    switch (active.action) {
      case "throwTeamMate": {
        const limit = this.teamMateThrowLimit(active.id);
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
      spend: this.state.turn.spend,
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
