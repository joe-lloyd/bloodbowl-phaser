import { type IEventBus } from "../../services/EventBus";
import { type IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { InjuryType, type Player, PlayerStatus } from "../../types/Player";
import {
  type ApothecaryCasualtyType,
  type ApothecaryDecisionAnswer,
  type ApothecaryDecisionRequest,
  type ApothecaryLocation,
} from "../../types/decisions";
import { emptyInducementsState, Inducement } from "../../types/Inducements";
import { movePlayerToBox } from "../rules/playerLocation";
import { inducementUsesLeft, spendInducement } from "./inventory";
import { confirmKill } from "../rules/plagueRidden";
import { isFrog } from "./matchInducements";

function recordedInjury(casualtyType: ApothecaryCasualtyType): InjuryType {
  switch (casualtyType) {
    case "badly-hurt":
      return InjuryType.BADLY_HURT;
    case "seriously-hurt":
      return InjuryType.MISS_NEXT_GAME;
    case "dead":
      return InjuryType.DEAD;
  }
}

function ensureInducementsState(
  gameService: IGameService
): NonNullable<ReturnType<IGameService["getState"]>["inducements"]> {
  const state = gameService.getState();
  if (!state.inducements) {
    state.inducements = emptyInducementsState();
  }
  return state.inducements;
}

const APOTHECARY_INDUCEMENTS = [
  Inducement.WANDERING_APOTHECARY,
  Inducement.PLAGUE_DOCTOR,
] as const;

function ownApothecaryAvailable(
  gameService: IGameService,
  teamId: string
): boolean {
  return (
    !!gameService.getTeam(teamId)?.apothecary &&
    !gameService.getState().inducements?.apothecaryUsed?.[teamId]
  );
}

function apothecaryAvailable(
  gameService: IGameService,
  teamId: string
): boolean {
  const state = gameService.getState();
  return (
    ownApothecaryAvailable(gameService, teamId) ||
    APOTHECARY_INDUCEMENTS.some(
      (inducement) => inducementUsesLeft(state, teamId, inducement) > 0
    )
  );
}

function spendApothecary(gameService: IGameService, teamId: string): void {
  if (ownApothecaryAvailable(gameService, teamId)) {
    ensureInducementsState(gameService).apothecaryUsed[teamId] = true;
    return;
  }
  const state = gameService.getState();
  APOTHECARY_INDUCEMENTS.some((inducement) =>
    spendInducement(state, teamId, inducement)
  );
}

type ApothecaryOffer =
  | {
      resultKind: "ko";
      location: ApothecaryLocation;
      position?: { x: number; y: number };
    }
  | {
      resultKind: "casualty";
      casualtyType: ApothecaryCasualtyType;
      killerId?: string;
      armsPlagueRidden?: boolean;
    };

export async function offerApothecary(
  gameService: IGameService,
  eventBus: IEventBus,
  player: Player,
  opts: ApothecaryOffer
): Promise<boolean> {
  const teamId = player.teamId;
  if (!apothecaryAvailable(gameService, teamId)) return false;

  if (isFrog(gameService.getState(), player.id)) return false;

  const inducements = ensureInducementsState(gameService);
  const id = `apothecary-${String(++inducements.decisionSeq)}`;
  const request: ApothecaryDecisionRequest = {
    type: "apothecary",
    id,
    chooserTeamId: teamId,
    playerId: player.id,
    resultKind: opts.resultKind,
    ...(opts.resultKind === "ko"
      ? { location: opts.location, ...(opts.position === undefined ? {} : { position: opts.position }) }
      : {
          casualtyType: opts.casualtyType,
          ...(opts.killerId ? { killerId: opts.killerId } : {}),
          ...(opts.armsPlagueRidden ? { armsPlagueRidden: true } : {}),
        }),
  };
  inducements.pendingApothecaryDecision = request;

  const answer = await gameService.getDecisionService().request(request);
  applyApothecaryAnswer(
    gameService,
    eventBus,
    request,
    answer as ApothecaryDecisionAnswer
  );
  return true;
}

function applyOriginalResult(
  gameService: IGameService,
  eventBus: IEventBus,
  request: ApothecaryDecisionRequest,
  player: Player
): void {
  if (request.resultKind === "ko") {
    movePlayerToBox(player, { box: "ko" }, eventBus);
    return;
  }
  const dead = request.casualtyType === "dead";
  movePlayerToBox(player, { box: "casualty", dead }, eventBus);
  if (dead) {
    confirmKill(
      gameService,
      eventBus,
      player,
      request.killerId,
      !!request.armsPlagueRidden
    );
  }
}

function applyApothecaryAnswer(
  gameService: IGameService,
  eventBus: IEventBus,
  request: ApothecaryDecisionRequest,
  answer: ApothecaryDecisionAnswer
): void {
  const inducements = ensureInducementsState(gameService);
  if (inducements.pendingApothecaryDecision?.id === request.id) {
    delete inducements.pendingApothecaryDecision;
  }

  const player = gameService.getPlayerById(request.playerId);
  if (!player) return;

  if (!answer.accept) {
    applyOriginalResult(gameService, eventBus, request, player);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName}'s Apothecary is held in reserve.`
    );
    return;
  }

  spendApothecary(gameService, request.chooserTeamId);

  if (request.resultKind === "ko") {
    if (request.location === "pitch" && request.position) {
      movePlayerToBox(
        player,
        {
          box: "pitch",
          position: request.position,
          status: PlayerStatus.STUNNED,
        },
        eventBus
      );
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} is patched up — Stunned but stays on the pitch!`
      );
    } else {
      movePlayerToBox(player, { box: "reserves" }, eventBus);
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${player.playerName} is patched up and moves to the Reserves.`
      );
    }
    return;
  }

  const roll = gameService
    .getDiceController()
    .rollD6(
      `Apothecary Patch-Up (${player.playerName})`,
      request.chooserTeamId
    );
  if (roll >= 4) {
    if (request.casualtyType) {
      const index = player.injuries.lastIndexOf(
        recordedInjury(request.casualtyType)
      );
      if (index >= 0) player.injuries.splice(index, 1);
    }
    movePlayerToBox(player, { box: "reserves" }, eventBus);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName}'s Apothecary patch-up succeeds (${String(roll)}) — to the Reserves!`
    );
  } else {
    applyOriginalResult(gameService, eventBus, request, player);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName}'s Apothecary patch-up fails (${String(roll)}).`
    );
  }
}

export function resumeApothecaryDecision(
  gameService: IGameService,
  eventBus: IEventBus,
  request: ApothecaryDecisionRequest
): void {
  gameService.getDecisionService().seed(request, (answer) => {
    applyApothecaryAnswer(
      gameService,
      eventBus,
      request,
      answer as ApothecaryDecisionAnswer
    );
  });
}
