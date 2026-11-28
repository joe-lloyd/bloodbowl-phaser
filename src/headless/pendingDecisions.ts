import { type PendingDecision } from "./protocol";
import { GameEventNames } from "../types/events";
import { type DecisionRequest } from "../types/decisions";
import { type Player } from "../types/Player";
import { type BlockRollData } from "../services/BlockResolutionService";

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
        ...(request.rollName !== undefined && { rollName: request.rollName }),
        sources: request.sources,
        ...(request.skill !== undefined && { skill: request.skill }),
        roll: request.roll,
        ...(request.needed !== undefined && { needed: request.needed }),
      };
    case "reaction":
      return {
        type: "reaction",
        playerId: request.playerId,
        chooserTeamId: request.chooserTeamId,
        skill: request.skill,
        prompt: request.prompt,
        ...(request.opponentId !== undefined && { opponentId: request.opponentId }),
      };
    case "bite-target":
      return {
        type: "bite-target",
        playerId: request.playerId,
        chooserTeamId: request.chooserTeamId,
        targetIds: [...request.targetIds],
        ...(request.purpose && { purpose: request.purpose }),
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
        ...(request.skills && { skills: [...request.skills] }),
        ...(request.stats && { stats: [...request.stats] }),
        ...(request.spells && { spells: [...request.spells] }),
        ...(request.item !== undefined && { item: request.item }),
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
        ...(request.location !== undefined && { location: request.location }),
        ...(request.position !== undefined && { position: request.position }),
        ...(request.casualtyType !== undefined && { casualtyType: request.casualtyType }),
      };
    case "reserve-move":
      return {
        type: "reserve-move",
        chooserTeamId: request.chooserTeamId,
        playerIds: [...request.playerIds],
        squares: request.squares.map((square) => ({ ...square })),
      };
    default:
      return unsurfaced(request);
  }
}

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
    ...(data.choiceStage !== undefined && { choiceStage: data.choiceStage }),
    ...(data.teamRerollAvailable !== undefined && { teamRerollAvailable: data.teamRerollAvailable }),
    ...(data.proAvailable !== undefined && { proAvailable: data.proAvailable }),
    ...(data.brawlerAvailable !== undefined && { brawlerAvailable: data.brawlerAvailable }),
    ...(data.veteranRerollAvailable !== undefined && { veteranRerollAvailable: data.veteranRerollAvailable }),
  };
}

export function engineDecision(
  name: string,

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
