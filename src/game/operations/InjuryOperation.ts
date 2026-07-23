import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { PlayerStatus } from "../../types/Player.js";
import { InjuryResult } from "../controllers/InjuryController.js";
import { CasualtyOperation } from "./CasualtyOperation.js";
import { CasualtyCause } from "../rules/plagueRidden";
import { foldTrigger, InjuryRollContext } from "../skills";

/**
 * InjuryOperation
 *
 * Responsibility:
 * - Execute Injury Roll (2D6), applying any carried modifier (Mighty Blow)
 * - Fold skill rules that adjust the result (Thick Skull)
 * - Update Player Status (STUNNED, KO, CASUALTY)
 * - If CASUALTY, trigger CasualtyOperation
 */
export class InjuryOperation extends GameOperation {
  public readonly name = "InjuryOperation";

  constructor(
    private playerId: string,
    private opts: {
      modifier?: number;
      causedById?: string;
      /** What inflicted the injury — "block" arms Plague Ridden downstream. */
      cause?: CasualtyCause;
    } = {}
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;
    const flowManager = context.flowManager;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;
    const causedBy = this.opts.causedById
      ? gameService.getPlayerById(this.opts.causedById)
      : undefined;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Injury Roll for ${player.playerName}`
    );

    // Suspense delay
    await context.delay(800);

    // 1. Roll 2D6 via DiceController
    const roll = gameService
      .getDiceController()
      .roll2D6(`Injury Roll (${player.playerName})`);

    // 2. Fold the rules' declared effects (table switch, KO downgrade),
    // then resolve them together — stacked skills stay independent
    const injuryController = gameService.getInjuryController();
    const modifier = this.opts.modifier ?? 0;
    const total = roll + modifier;
    const ctx: InjuryRollContext = {
      player,
      causedBy,
      roll,
      modifier,
      table: "standard",
      result: injuryController.getInjuryResult(player, total),
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger(
      "onInjuryRoll",
      causedBy ? [causedBy, player] : [player],
      ctx
    );

    ctx.result = injuryController.getInjuryResult(player, total, ctx.table);
    if (
      ctx.koDowngrade &&
      ctx.result === InjuryResult.KO &&
      total === injuryController.lowestKO(ctx.table)
    ) {
      ctx.result = InjuryResult.STUNNED;
      ctx.triggers.push(ctx.koDowngrade);
    }
    ctx.casualtyAutoBadlyHurt =
      ctx.result === InjuryResult.CASUALTY &&
      injuryController.isAutoBadlyHurt(ctx.table, total);

    ctx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    // 3. Apply status
    switch (ctx.result) {
      case InjuryResult.STUNNED:
        eventBus.emit(GameEventNames.UI_Notification, "STUNNED!");
        player.status = PlayerStatus.STUNNED;
        break;
      case InjuryResult.KO:
        eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");
        player.status = PlayerStatus.KO;
        break;
      case InjuryResult.CASUALTY:
        eventBus.emit(GameEventNames.UI_Notification, "CASUALTY!");
        player.status = PlayerStatus.INJURED;
        eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
          causerId: this.opts.causedById,
          victimId: player.id,
          cause:
            this.opts.cause ?? (this.opts.causedById ? "special" : "crowd"),
          sppEligible:
            this.opts.cause === "block" &&
            !!this.opts.causedById &&
            this.opts.causedById !== player.id,
        });
        // Trigger Casualty Operation
        flowManager.add(
          new CasualtyOperation(this.playerId, this.opts.causedById, {
            autoBadlyHurt: ctx.casualtyAutoBadlyHurt,
            cause: this.opts.cause,
          }),
          true
        );
        break;
    }

    // Emit status change event (if exists) or just generic update
    // Assuming service or managers handle the actual removal from pitch if status is KO/INJURED
  }
}
