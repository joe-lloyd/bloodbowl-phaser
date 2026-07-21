import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryType, PlayerStatus } from "../../types/Player.js";
import { CasualtyType } from "../controllers/InjuryController.js";
import {
  foldTrigger,
  CasualtyContext,
  CasualtyRollContext,
} from "../skills";

/**
 * CasualtyOperation
 *
 * Responsibility:
 * - Offer pre-roll saves (Regeneration) via the casualty trigger
 * - Execute Casualty Roll (D16), letting rules modify it (Decay)
 * - Determine specific permanent injury and update player state
 */
export class CasualtyOperation extends GameOperation {
  public readonly name = "CasualtyOperation";

  constructor(
    private playerId: string,
    private causedById?: string,
    private opts: {
      /** No Casualty Roll — automatically Badly Hurt (Stunty's 9). */
      autoBadlyHurt?: boolean;
    } = {}
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

    // Trigger point: a rule may save the player before the roll
    const preCtx: CasualtyContext = {
      player,
      causedBy,
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger("onCasualty", [player], preCtx);
    preCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );
    if (preCtx.regenerated) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} regenerates!`
      );
      player.status = PlayerStatus.RESERVE;
      player.gridPosition = undefined;
      return;
    }

    if (this.opts.autoBadlyHurt) {
      // Stunty's 9: no Casualty Roll is made — automatically Badly Hurt
      eventBus.emit(
        GameEventNames.UI_Notification,
        `Result: ${CasualtyType.BADLY_HURT}`
      );
      player.injuries.push(InjuryType.BADLY_HURT);
      return;
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Casualty Roll for ${player.playerName}`
    );

    // Suspense delay
    await context.delay(800);

    // 1. Roll D16 via DiceController
    const roll = gameService
      .getDiceController()
      .rollD16(`Casualty Roll (${player.playerName})`);

    // 2. Trigger point: rules may modify the casualty roll (Decay +1)
    const rollCtx: CasualtyRollContext = {
      player,
      causedBy,
      roll,
      modifier: 0,
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger(
      "onCasualtyRoll",
      causedBy ? [causedBy, player] : [player],
      rollCtx
    );
    rollCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    const injuryController = gameService.getInjuryController();
    const result = injuryController.getCasualtyResult(
      rollCtx.roll + rollCtx.modifier
    );

    eventBus.emit(GameEventNames.UI_Notification, `Result: ${result}`);

    // 3. Apply to player permanent injuries
    switch (result) {
      case CasualtyType.BADLY_HURT:
        player.injuries.push(InjuryType.BADLY_HURT);
        break;
      case CasualtyType.SERIOUSLY_HURT:
        player.injuries.push(InjuryType.MISS_NEXT_GAME);
        break;
      case CasualtyType.SERIOUS_INJURY:
        player.injuries.push(InjuryType.NIGGLING_INJURY);
        break;
      case CasualtyType.LASTING_INJURY:
        // For simplicity, pick a stat. Real logic would roll another D6 or similar.
        player.injuries.push(InjuryType.STAT_DECREASE_MA);
        break;
      case CasualtyType.DEAD:
        player.injuries.push(InjuryType.DEAD);
        break;
    }
  }
}
