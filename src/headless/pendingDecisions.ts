/**
 * Pending decisions - the protocol shape of each choice the engine pauses on,
 * built from the event that announces it.
 */

import { PendingDecision } from "./protocol";
import { GameEventNames } from "../types/events";
import { DecisionRequest } from "../types/decisions";
import { Player } from "../types/Player";
import { BlockRollData } from "../services/BlockResolutionService";

/**
 * An awaitable decision: the engine is paused on its promise until the reply.
 * Null for a request headless does not surface.
 */
export function requestedDecision(
  request: DecisionRequest | undefined
): PendingDecision | null {
  if (!request) return null;
  switch (request.type) {
    case "reroll":
      return {
        type: "reroll",
        playerId: request.playerId,
        chooserTeamId: request.chooserTeamId,
        rollKind: request.rollKind,
        rollName: request.rollName,
        sources: request.sources,
        skill: request.skill,
        roll: request.roll,
        needed: request.needed,
      };
    case "reaction":
      return {
        type: "reaction",
        playerId: request.playerId,
        chooserTeamId: request.chooserTeamId,
        skill: request.skill,
        prompt: request.prompt,
      };
    case "bite-target":
      return {
        type: "bite-target",
        playerId: request.playerId,
        chooserTeamId: request.chooserTeamId,
        targetIds: [...request.targetIds],
      };
    case "interception":
      return {
        type: "interception",
        chooserTeamId: request.chooserTeamId,
        passerId: request.passerId,
        candidates: request.candidates,
      };
    case "inducement-choice":
      return {
        type: "inducement-choice",
        kind: request.kind,
        chooserTeamId: request.chooserTeamId,
        playerIds: [...request.playerIds],
        ...(request.skills ? { skills: [...request.skills] } : {}),
        ...(request.stats ? { stats: [...request.stats] } : {}),
        ...(request.spells ? { spells: [...request.spells] } : {}),
        optional: request.optional,
      };
    case "foul-assists":
      return {
        type: "foul-assists",
        playerId: request.playerId,
        targetId: request.targetId,
        chooserTeamId: request.chooserTeamId,
        available: request.available,
        defensive: request.defensive,
      };
    case "apothecary":
      return {
        type: "apothecary",
        id: request.id,
        chooserTeamId: request.chooserTeamId,
        playerId: request.playerId,
        resultKind: request.resultKind,
        location: request.location,
        position: request.position,
        casualtyType: request.casualtyType,
      };
    default:
      return unsurfaced(request);
  }
}

/** A request type added later fails the build here until it is surfaced. */
function unsurfaced(_request: never): null {
  return null;
}

function blockDiceDecision(
  data: BlockRollData,
  findPlayer: (playerId: string) => Player | undefined
): PendingDecision {
  const chooserId = data.isAttackerChoice ? data.attackerId : data.defenderId;
  return {
    type: "block-dice",
    attackerId: data.attackerId,
    defenderId: data.defenderId,
    chooserTeamId: findPlayer(chooserId)?.teamId ?? "",
    options: data.results,
    choiceStage: data.choiceStage,
    teamRerollAvailable: data.teamRerollAvailable,
    proAvailable: data.proAvailable,
    brawlerAvailable: data.brawlerAvailable,
    veteranRerollAvailable: data.veteranRerollAvailable,
  };
}

/**
 * A choice inside a block or kick-off, announced by an ordinary engine event
 * rather than awaited. Null for any other event.
 */
export function engineDecision(
  name: string,
  // The event bus delivers every payload untyped; each case reads its own.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  findPlayer: (playerId: string) => Player | undefined
): PendingDecision | null {
  switch (name) {
    case GameEventNames.BlockDiceRolled:
    case GameEventNames.BlockDiceKept:
      return blockDiceDecision(data, findPlayer);
    case GameEventNames.UI_SelectPushDirection:
      return {
        type: "push-direction",
        attackerId: data.attackerId,
        defenderId: data.defenderId,
        resultType: data.resultType,
        chooserTeamId: data.chooserTeamId,
        options: data.validDirections,
      };
    case GameEventNames.PlayerMoved:
      return data?.followUpData
        ? {
            type: "follow-up",
            attackerId: data.followUpData.attackerId,
            targetSquare: data.followUpData.targetSquare,
          }
        : null;
    case GameEventNames.TouchbackAwarded:
      return { type: "touchback", teamId: data.teamId };
    case GameEventNames.UI_FollowUpPrompt:
      // Crowd surf: the engine prompts the follow-up directly (there is no
      // PlayerMoved for the surfed defender)
      return data.repeat
        ? null
        : {
            type: "follow-up",
            attackerId: data.attackerId,
            targetSquare: data.targetSquare,
          };
    default:
      return null;
  }
}
