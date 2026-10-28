import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryType, PlayerStatus } from "../../types/Player.js";
import {
  CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController.js";
import {
  CasualtyCause,
  confirmKill,
  plagueRiddenApplies,
} from "../rules/plagueRidden";
import { foldTrigger, CasualtyContext } from "../skills";
import { movePlayerToBox } from "../rules/playerLocation";
import { ApothecaryCasualtyType } from "../../types/decisions";
import { offerApothecary } from "../inducements/apothecary";
import { rerollFailedRegeneration } from "../inducements/regeneration";

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
    if (
      preCtx.regenerated ||
      rerollFailedRegeneration(gameService, eventBus, player)
    ) {
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
        break;
    }

    // Every casualty gets first say from an owned, unused Apothecary. A
    // successful patch-up strikes the record above, and Plague Ridden counts
    // only a kill the Apothecary did not save, so the kill is confirmed after
    // that say: by the Apothecary resolution when one is offered, here when
    // none is.
    const kill =
      result === InjuryResult.DEAD
        ? {
            killerId: this.causedById,
            armsPlagueRidden:
              !!causedBy && plagueRiddenApplies(causedBy, player, this.cause),
          }
        : undefined;
    const offered = await offerApothecary(gameService, eventBus, player, {
      resultKind: "casualty",
      casualtyType: apothecaryCasualtyType(result),
      ...kill,
    });
    if (offered) return;

    // Off to the Casualty box through the one location seam, so the pitch
    // square is released as the Casualty-box entry is created.
    movePlayerToBox(
      player,
      { box: "casualty", dead: result === InjuryResult.DEAD },
      eventBus
    );
    if (kill) {
      confirmKill(
        gameService,
        eventBus,
        player,
        kill.killerId,
        kill.armsPlagueRidden
      );
    }
  }
}
