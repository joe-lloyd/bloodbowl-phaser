import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryType, PlayerStatus } from "../../types/Player.js";
import { CasualtyType } from "../controllers/InjuryController.js";
import { SkillType } from "../../types/Skills";
import {
  CasualtyCause,
  plagueRiddenApplies,
  addReserveLineman,
} from "../rules/plagueRidden";
import { foldTrigger, CasualtyContext, CasualtyRollContext } from "../skills";

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
      /** What inflicted the casualty — "block" can arm Plague Ridden. */
      cause?: CasualtyCause;
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
      cause: this.opts.cause,
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
      player.status = PlayerStatus.RESERVE;
      this.removeFromPitch(eventBus, player);
      return;
    }

    if (this.opts.autoBadlyHurt) {
      // Stunty's 9: no Casualty Roll is made — automatically Badly Hurt
      eventBus.emit(
        GameEventNames.UI_Notification,
        `Result: ${CasualtyType.BADLY_HURT}`
      );
      player.injuries.push(InjuryType.BADLY_HURT);
      this.removeFromPitch(eventBus, player);
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
        player.status = PlayerStatus.DEAD;
        // Plague Ridden: a Block Action kill by the trait-holder against an
        // eligible opponent lets their coach add a Lineman to the Reserves.
        if (
          causedBy &&
          plagueRiddenApplies(causedBy, player, this.opts.cause)
        ) {
          this.applyPlagueRidden(gameService, eventBus, causedBy, player);
        }
        break;
    }

    // A casualty leaves play for the Casualty box: clear its square and
    // announce the status change so the pitch sprite is removed and the
    // dugout re-renders it among the casualties (not left lying on the pitch).
    this.removeFromPitch(eventBus, player);
  }

  /** Send a casualty off the pitch: clear its square, announce the change. */
  private removeFromPitch(
    eventBus: import("../../services/EventBus").IEventBus,
    player: import("../../types/Player").Player
  ): void {
    player.gridPosition = undefined;
    eventBus.emit(GameEventNames.PlayerStatusChanged, player);
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
