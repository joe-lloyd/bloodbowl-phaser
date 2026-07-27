/**
 * Sevens Apothecary — the once-per-match patch-up decision.
 *
 * An owned, unused Apothecary is offered immediately after an eligible
 * Knocked Out or casualty result, before the player's final placement
 * (design.md "Pause injury resolution for an owned Apothecary"). Declining
 * leaves the original result untouched; accepting always consumes the
 * Apothecary, whether or not the patch-up succeeds.
 *
 * `applyApothecaryAnswer` is the single resolution routine, called both from
 * the live await (a fresh decision, mid-operation) and from a re-armed seed
 * after a cold restore (see DecisionService.seed / GameService construction)
 * — a resumed decision needs no operation call stack, only the data already
 * captured on the request.
 */

import { IEventBus } from "../../services/EventBus";
import { IGameService } from "../../services/interfaces/IGameService";
import { GameEventNames } from "../../types/events";
import { Player, PlayerStatus } from "../../types/Player";
import {
  ApothecaryCasualtyType,
  ApothecaryDecisionAnswer,
  ApothecaryDecisionRequest,
  ApothecaryLocation,
} from "../../types/decisions";
import { emptyInducementsState } from "../../types/Inducements";
import { movePlayerToBox } from "../rules/playerLocation";

/** Get (creating if absent) this match's inducements state. */
export function ensureInducementsState(
  gameService: IGameService
): NonNullable<ReturnType<IGameService["getState"]>["inducements"]> {
  const state = gameService.getState();
  if (!state.inducements) {
    state.inducements = emptyInducementsState();
  }
  return state.inducements;
}

/** True when this team has a Sevens Apothecary that hasn't been used yet. */
export function apothecaryAvailable(
  gameService: IGameService,
  teamId: string
): boolean {
  const team = gameService.getTeam(teamId);
  if (!team?.apothecary) return false;
  return !gameService.getState().inducements?.apothecaryUsed?.[teamId];
}

type ApothecaryOffer =
  | {
      resultKind: "ko";
      location: ApothecaryLocation;
      position?: { x: number; y: number };
    }
  | { resultKind: "casualty"; casualtyType: ApothecaryCasualtyType };

/**
 * Offer the Apothecary for an eligible result. Returns false (no-op) when no
 * unused Apothecary is available — the caller applies the original result
 * itself. Returns true once the decision (and its outcome) is fully applied.
 */
export async function offerApothecary(
  gameService: IGameService,
  eventBus: IEventBus,
  player: Player,
  opts: ApothecaryOffer
): Promise<boolean> {
  const teamId = player.teamId;
  if (!apothecaryAvailable(gameService, teamId)) return false;

  const inducements = ensureInducementsState(gameService);
  const id = `apothecary-${++inducements.decisionSeq}`;
  const request: ApothecaryDecisionRequest = {
    type: "apothecary",
    id,
    chooserTeamId: teamId,
    playerId: player.id,
    resultKind: opts.resultKind,
    ...(opts.resultKind === "ko"
      ? { location: opts.location, position: opts.position }
      : { casualtyType: opts.casualtyType }),
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
  eventBus: IEventBus,
  request: ApothecaryDecisionRequest,
  player: Player
): void {
  if (request.resultKind === "ko") {
    movePlayerToBox(player, { box: "ko" }, eventBus);
  } else {
    movePlayerToBox(
      player,
      { box: "casualty", dead: request.casualtyType === "dead" },
      eventBus
    );
  }
}

/**
 * Apply an Apothecary decision's outcome. Idempotent against the request id:
 * if the pending decision no longer matches (already resolved), this still
 * safely re-applies the same deterministic outcome rather than erroring —
 * but callers only ever invoke it once per id via DecisionService's
 * single-pending-decision gate, which itself prevents a second resolution.
 */
export function applyApothecaryAnswer(
  gameService: IGameService,
  eventBus: IEventBus,
  request: ApothecaryDecisionRequest,
  answer: ApothecaryDecisionAnswer
): void {
  const inducements = ensureInducementsState(gameService);
  if (inducements.pendingApothecaryDecision?.id === request.id) {
    inducements.pendingApothecaryDecision = undefined;
  }

  const player = gameService.getPlayerById(request.playerId);
  if (!player) return;

  if (!answer.accept) {
    applyOriginalResult(eventBus, request, player);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName}'s Apothecary is held in reserve.`
    );
    return;
  }

  inducements.apothecaryUsed[request.chooserTeamId] = true;

  if (request.resultKind === "ko") {
    if (request.location === "pitch" && request.position) {
      movePlayerToBox(
        player,
        { box: "pitch", position: request.position, status: PlayerStatus.STUNNED },
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

  // Casualty: one D6 through the match RNG (recorded like every other roll).
  // 4+ moves the player to Reserves; 1-3 leaves the original result standing.
  const roll = gameService
    .getDiceController()
    .rollD6(`Apothecary Patch-Up (${player.playerName})`, request.chooserTeamId);
  if (roll >= 4) {
    movePlayerToBox(player, { box: "reserves" }, eventBus);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName}'s Apothecary patch-up succeeds (${roll}) — to the Reserves!`
    );
  } else {
    applyOriginalResult(eventBus, request, player);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${player.playerName}'s Apothecary patch-up fails (${roll}).`
    );
  }
}

/**
 * Re-arm a decision restored mid-flight from a save. Called once at engine
 * construction time when the restored state still has a pending decision —
 * the original operation's call stack is gone, so answering resolves
 * directly through `applyApothecaryAnswer` rather than unblocking an await.
 */
export function resumeApothecaryDecision(
  gameService: IGameService,
  eventBus: IEventBus,
  request: ApothecaryDecisionRequest
): void {
  gameService.getDecisionService().seed(request, (answer) =>
    applyApothecaryAnswer(
      gameService,
      eventBus,
      request,
      answer as ApothecaryDecisionAnswer
    )
  );
}
