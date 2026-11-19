import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService.js";
import { type Player, PlayerStatus } from "../../types/Player.js";
import {
  type CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController.js";
import { CasualtyOperation } from "./CasualtyOperation.js";
import { type CasualtyCause } from "../rules/plagueRidden";
import { movePlayerToBox } from "../rules/playerLocation";
import { foldTrigger, type InjuryRollContext } from "../skills";
import { offerApothecary } from "../inducements/apothecary";
import { isFrog } from "../inducements/matchInducements";
import { type FlowContext } from "../core/GameFlowManager";
import {
  type InjuryParties,
  InjuryPartiesOperation,
} from "./injuryParties";

export async function resolveInjuryRoll(
  context: Pick<FlowContext, "gameService" | "eventBus" | "flowManager">,
  player: Player,
  roll: number,
  modifier: number,
  causedBy?: Player
): Promise<InjuryRollContext> {
  const { gameService, eventBus, flowManager } = context;
  const injuryController = gameService.getInjuryController();
  const total = roll + modifier;
  const ctx: InjuryRollContext = {
    player,
    ...(causedBy === undefined ? {} : { causedBy: causedBy }),
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
  ctx.triggers.forEach((t) => {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  });
  return ctx;
}

export function reportedInjury(
  gameService: IGameService,
  playerId: string,
  result: InjuryResult
): InjuryResult {
  return isCasualty(result) && isFrog(gameService.getState(), playerId)
    ? InjuryResult.BADLY_HURT
    : result;
}

function isCasualty(result: InjuryResult): result is CasualtyType {
  return (
    result === InjuryResult.BADLY_HURT ||
    result === InjuryResult.SERIOUSLY_HURT ||
    result === InjuryResult.DEAD
  );
}

export class InjuryOperation extends InjuryPartiesOperation {
  public readonly name = "InjuryOperation";

  private opts: {
    modifier?: number;
    causedById?: string;

    cause?: CasualtyCause;

    roll?: number;

    casualtyIsBadlyHurt?: boolean;

    stunnedIsKnockedOut?: boolean;

    stunnedToReserves?: boolean;
  };
  constructor(
    playerId: string,
    opts: {
      modifier?: number;
      causedById?: string;

      cause?: CasualtyCause;

      roll?: number;

      casualtyIsBadlyHurt?: boolean;

      stunnedIsKnockedOut?: boolean;

      stunnedToReserves?: boolean;
    } = {}
  ) {
    super(playerId, opts.causedById);
    this.opts = opts;
  }

  protected async resolve(
    context: FlowContext,
    { player, causedBy }: InjuryParties
  ): Promise<void> {
    const { gameService, eventBus } = context;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Injury Roll for ${player.playerName}`
    );

    const roll =
      this.opts.roll ??
      gameService
        .getDiceController()
        .roll2D6(`Injury Roll (${player.playerName})`, player.teamId);

    const ctx = await resolveInjuryRoll(
      context,
      player,
      roll,
      this.opts.modifier ?? 0,
      causedBy
    );

    ctx.result = this.overridden(ctx.result);
    this.report(gameService, eventBus, player, ctx.result);
    switch (ctx.result) {
      case InjuryResult.STUNNED:
        eventBus.emit(GameEventNames.UI_Notification, "STUNNED!");
        player.status = PlayerStatus.STUNNED;

        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
        break;
      case InjuryResult.KO: {
        eventBus.emit(GameEventNames.UI_Notification, "KNOCKED OUT!");

        const patchedUp = await offerApothecary(gameService, eventBus, player, {
          resultKind: "ko",
          location: "pitch",
          ...(player.gridPosition ? { position: player.gridPosition } : {}),
        });
        if (!patchedUp) {
          movePlayerToBox(player, { box: "ko" }, eventBus);
        }
        break;
      }
      case InjuryResult.BADLY_HURT:
      case InjuryResult.SERIOUSLY_HURT:
      case InjuryResult.DEAD:
        this.casualty(context, player, ctx.result);
        break;
    }
  }

  private overridden(result: InjuryResult): InjuryResult {
    if (this.opts.stunnedIsKnockedOut && result === InjuryResult.STUNNED) {
      return InjuryResult.KO;
    }
    if (this.opts.casualtyIsBadlyHurt && isCasualty(result)) {
      return InjuryResult.BADLY_HURT;
    }
    return result;
  }

  private report(
    gameService: IGameService,
    eventBus: FlowContext["eventBus"],
    player: Player,
    result: InjuryResult
  ): void {
    eventBus.emit(GameEventNames.InjuryRolled, {
      playerId: player.id,
      result: reportedInjury(gameService, player.id, result),
      rollType: `Injury Roll (${player.playerName})`,
      diceTeamId: player.teamId,
      ...(this.opts.stunnedToReserves ? { stunnedToReserves: true } : {}),
    });
  }

  private casualty(
    context: FlowContext,
    player: Player,
    result: CasualtyType
  ): void {
    const { eventBus, flowManager } = context;
    eventBus.emit(GameEventNames.UI_Notification, "CASUALTY!");
    player.status = PlayerStatus.INJURED;
    eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
      ...(this.opts.causedById !== undefined
        ? { causerId: this.opts.causedById }
        : {}),
      victimId: player.id,
      cause: this.opts.cause ?? "special",
      sppEligible:
        this.opts.cause === "block" &&
        !!this.opts.causedById &&
        this.opts.causedById !== player.id,
    });

    flowManager.add(
      new CasualtyOperation(
        this.playerId,
        result,
        this.opts.causedById,
        this.opts.cause
      ),
      true
    );
  }
}
