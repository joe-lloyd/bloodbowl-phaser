import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryType, PlayerStatus } from "../../types/Player.js";
import {
  CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController.js";
import { SkillType } from "../../types/Skills";
import {
  CasualtyCause,
  plagueRiddenApplies,
  addReserveLineman,
} from "../rules/plagueRidden";
import { foldTrigger, CasualtyContext } from "../skills";
import { movePlayerToBox } from "../rules/playerLocation";
import { ApothecaryCasualtyType } from "../../types/decisions";
import { offerApothecary } from "../inducements/apothecary";

function apothecaryCasualtyType(result: CasualtyType): ApothecaryCasualtyType {
  switch (result) {
    case InjuryResult.BADLY_HURT:
      return "badly-hurt";
    case InjuryResult.SERIOUSLY_HURT:
      return "seriously-hurt";
    case InjuryResult.DEAD:
      return "dead";
  }
}

/**
 * CasualtyOperation
 *
 * Responsibility:
 * - Offer saves (Regeneration) via the casualty trigger
 * - Apply the Sevens injury table's casualty result (I3-I5). There is no
 *   Casualty Roll and no Lasting Injury.
 * - Offer the Apothecary before the player leaves for the Casualty box
 */
export class CasualtyOperation extends GameOperation {
  public readonly name = "CasualtyOperation";

  constructor(
    private playerId: string,
    private result: CasualtyType,
    private causedById?: string,
    /** What inflicted the casualty — "block" can arm Plague Ridden. */
    private cause?: CasualtyCause
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;
    const causedBy = this.causedById
      ? gameService.getPlayerById(this.causedById)
      : undefined;

    // Trigger point: a rule may save the player before the result applies
    const preCtx: CasualtyContext = {
      player,
      causedBy,
      cause: this.cause,
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger(
      "onCasualty",
      causedBy ? [causedBy, player] : [player],
      preCtx
    );
    preCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );
    if (preCtx.regenerated) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} regenerates!`
      );
      movePlayerToBox(player, { box: "reserves" }, eventBus);
      return;
    }

    const result = this.result;
    eventBus.emit(GameEventNames.UI_Notification, `Result: ${result}`);

    // Record the result on the player: Badly Hurt is out for this game only,
    // Seriously Hurt also misses the next league game, Dead leaves the roster.
    switch (result) {
      case InjuryResult.BADLY_HURT:
        player.injuries.push(InjuryType.BADLY_HURT);
        break;
      case InjuryResult.SERIOUSLY_HURT:
        player.injuries.push(InjuryType.MISS_NEXT_GAME);
        break;
      case InjuryResult.DEAD:
        player.injuries.push(InjuryType.DEAD);
        player.status = PlayerStatus.DEAD;
        eventBus.emit(GameEventNames.PlayerKilled, {
          causerId: this.causedById,
          victimId: player.id,
        });
        // Plague Ridden: a Block Action kill by the trait-holder against an
        // eligible opponent lets their coach add a Lineman to the Reserves.
        if (
          causedBy &&
          plagueRiddenApplies(causedBy, player, this.cause)
        ) {
          this.applyPlagueRidden(gameService, eventBus, causedBy, player);
        }
        break;
    }

    // A casualty leaves play for the Casualty box: clear its square and
    // announce the status change so the pitch sprite is removed and the
    // dugout re-renders it among the casualties (not left lying on the pitch).
    // Every casualty gets first say from an owned, unused Apothecary before
    // that final placement.
    const patchedUp = await offerApothecary(gameService, eventBus, player, {
      resultKind: "casualty",
      casualtyType: apothecaryCasualtyType(result),
    });
    if (!patchedUp) {
      this.removeFromPitch(eventBus, player);
    }
  }

  /**
   * Send a casualty off the pitch — through the one location seam, so the
   * pitch square is released as the Casualty-box entry is created.
   */
  private removeFromPitch(
    eventBus: import("../../services/EventBus").IEventBus,
    player: import("../../types/Player").Player
  ): void {
    movePlayerToBox(
      player,
      { box: "casualty", dead: player.status === PlayerStatus.DEAD },
      eventBus
    );
  }

  /** Spend Plague Ridden: mark it used and add a Lineman to the Reserves. */
  private applyPlagueRidden(
    gameService: IGameService,
    eventBus: import("../../services/EventBus").IEventBus,
    killer: import("../../types/Player").Player,
    victim: import("../../types/Player").Player
  ): void {
    const team = gameService.getTeam(killer.teamId);
    if (!team) return;
    const reinforcement = addReserveLineman(team);
    if (!reinforcement) return;

    killer.plagueRiddenUsed = true;
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: killer.id,
      skill: SkillType.PLAGUE_RIDDEN,
      effect: `Plague Ridden: ${victim.playerName}'s death summons ${reinforcement.playerName} to the Reserves`,
    });
    eventBus.emit(
      GameEventNames.UI_Notification,
      `Plague Ridden — ${killer.playerName} adds ${reinforcement.playerName} to the Reserves!`
    );
    eventBus.emit(GameEventNames.RefreshBoard);
  }
}
