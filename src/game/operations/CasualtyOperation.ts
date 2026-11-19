import { GameOperation } from "../core/GameOperation";
import type { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryType, PlayerStatus } from "../../types/Player.js";
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

export class CasualtyOperation extends GameOperation {
  public readonly name = "CasualtyOperation";

  private playerId: string;
  private result: CasualtyType;
  private causedById: (string) | undefined;
  private cause: (CasualtyCause) | undefined;
  constructor(
    playerId: string,
    result: CasualtyType,
    causedById?: string,

    cause?: CasualtyCause
  ) {
    super();
    this.playerId = playerId;
    this.result = result;
    this.causedById = causedById;
    this.cause = cause;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;
    const causedBy = this.causedById
      ? gameService.getPlayerById(this.causedById)
      : undefined;

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

    const result = isFrog(gameService.getState(), player.id)
      ? InjuryResult.BADLY_HURT
      : this.result;
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
