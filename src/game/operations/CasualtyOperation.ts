import type { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "../../types/Player.js";
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
import {
  type CasualtyRecord,
  casualtyGradeFor,
  casualtyLabel,
  recordCasualty,
  sufferLastingInjury,
} from "./injuryVerdict";
import { type LastingInjury } from "../rules/injuryTables";

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

export class CasualtyOperation extends InjuryPartiesOperation {
  public readonly name = "CasualtyOperation";

  private result: CasualtyType;
  private record: CasualtyRecord | undefined;
  private cause: (CasualtyCause) | undefined;
  constructor(
    playerId: string,
    outcome: CasualtyType | CasualtyRecord,
    causedById?: string,

    cause?: CasualtyCause
  ) {
    super(playerId, causedById);
    this.result = typeof outcome === "string" ? outcome : outcome.result;
    this.record = typeof outcome === "string" ? undefined : outcome;
    this.cause = cause;
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

    const outcome = await this.recordOutcome(context, player);
    if (!outcome) return;
    const { result, lasting } = outcome;

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

    if (lasting) sufferLastingInjury(player, lasting, eventBus);
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

  private async recordOutcome(
    context: FlowContext,
    player: Player
  ): Promise<
    { result: CasualtyType; lasting: LastingInjury | undefined } | null
  > {
    const result = await variantCasualty(
      context,
      player,
      isFrog(context.gameService.getState(), player.id)
        ? InjuryResult.BADLY_HURT
        : this.result
    );
    if (result === "ko" || result === "reserves") {
      movePlayerToBox(player, { box: result }, context.eventBus);
      return null;
    }
    const lasting =
      this.record?.result === result ? this.record.lasting : undefined;
    const grade = casualtyGradeFor(result, this.record);
    announceCasualty(context.eventBus, player, casualtyLabel(grade, lasting));
    recordCasualty(player, grade);
    if (result === InjuryResult.DEAD) player.status = PlayerStatus.DEAD;
    return { result, lasting };
  }
}

function announceCasualty(
  eventBus: FlowContext["eventBus"],
  player: Player,
  label: string
): void {
  eventBus.emit(GameEventNames.UI_Notification, `Result: ${label}`);
  eventBus.emit(GameEventNames.UI_Announce, {
    kind: "casualty",
    headline: "Casualty",
    subtitle: `${player.playerName}: ${label}`,
  });
  eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "action",
    headline: "Casualty",
    detail: `${player.playerName}: ${label}`,
    teamId: player.teamId,
  });
}
