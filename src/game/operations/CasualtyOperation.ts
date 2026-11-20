import type { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { InjuryType, type Player, PlayerStatus } from "../../types/Player.js";
import {
  type CasualtyType,
  InjuryResult,
} from "../controllers/InjuryController.js";
import {
  type CasualtyCause,
  confirmKill,
  plagueRiddenApplies,
} from "../rules/plagueRidden";
import { foldTrigger, type CasualtyContext } from "../skills";
import { movePlayerToBox } from "../rules/playerLocation";
import { type ApothecaryCasualtyType } from "../../types/decisions";
import { offerApothecary } from "../inducements/apothecary";
import { isFrog } from "../inducements/matchInducements";
import { variantCasualty } from "../inducements/sawbones";
import { rerollFailedRegeneration } from "../inducements/regeneration";
import {
  type InjuryParties,
  InjuryPartiesOperation,
} from "./injuryParties";

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

function announceCasualty(
  eventBus: FlowContext["eventBus"],
  player: Player,
  result: CasualtyType
): void {
  eventBus.emit(GameEventNames.UI_Notification, `Result: ${result}`);

  eventBus.emit(GameEventNames.UI_Announce, {
    kind: "casualty",
    headline: "Casualty",
    subtitle: `${player.playerName}: ${result}`,
  });

  eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "action",
    headline: "Casualty",
    detail: `${player.playerName}: ${result}`,
    teamId: player.teamId,
  });
}

export class CasualtyOperation extends InjuryPartiesOperation {
  public readonly name = "CasualtyOperation";

  private result: CasualtyType;
  private cause: (CasualtyCause) | undefined;
  constructor(
    playerId: string,
    result: CasualtyType,
    causedById?: string,

    cause?: CasualtyCause
  ) {
    super(playerId, causedById);
    this.result = result;
    this.cause = cause;
  }

  private async finalResult(
    context: FlowContext,
    player: Player
  ): Promise<CasualtyType | null> {
    const outcome = await variantCasualty(
      context,
      player,
      isFrog(context.gameService.getState(), player.id)
        ? InjuryResult.BADLY_HURT
        : this.result
    );
    if (outcome !== "ko" && outcome !== "reserves") return outcome;
    movePlayerToBox(player, { box: outcome }, context.eventBus);
    return null;
  }

  protected async resolve(
    context: FlowContext,
    { player, causedBy }: InjuryParties
  ): Promise<void> {
    const { gameService, eventBus } = context;

    const preCtx: CasualtyContext = {
      player,
      ...(causedBy === undefined ? {} : { causedBy: causedBy }),
      ...(this.cause === undefined ? {} : { cause: this.cause }),
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
    preCtx.triggers.forEach((t) => {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    });
    if (
      preCtx.regenerated ||
      rerollFailedRegeneration(
        gameService,
        eventBus,
        player,
        preCtx.regenerationRoll
      )
    ) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} regenerates!`
      );
      movePlayerToBox(player, { box: "reserves" }, eventBus);
      return;
    }

    const result = await this.finalResult(context, player);
    if (result === null) return;
    announceCasualty(eventBus, player, result);

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

    const kill =
      result === InjuryResult.DEAD
        ? {
            ...(this.causedById !== undefined
              ? { killerId: this.causedById }
              : {}),
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
