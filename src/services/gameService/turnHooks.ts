/**
 * What GameService does on engine events and at the end of a turn:
 * conditions that expire, Sports-Wizard spells and Pick-Me-Up.
 */

import { GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import {
  PlayerStatus,
  PlayerCondition,
  hasCondition,
  removeCondition,
  hasTackleZone,
} from "@/types/Player";
import { foldTurnEnding, TurnEndingContext } from "@/game/skills";
import { holdsSportsWizard } from "@/game/inducements/matchInducements";
import { CastSportsWizardOperation } from "@/game/inducements/sportsWizard";
import { getDriveEffects } from "@/game/kickoff/driveEffects";
import type { GameParts } from "./parts";
import { whenSettled } from "./activation";

/** Rooted ends when its player is Knocked Down or Placed Prone. */
export function onPlayerDowned(parts: GameParts, playerId: string): void {
  const player = parts.game.getPlayerById(playerId);
  if (player && hasCondition(player, PlayerCondition.ROOTED)) {
    removeCondition(player, PlayerCondition.ROOTED);
    parts.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  }
}

/** Chomped ends the moment the chomper is no longer Marking the victim. */
export function sweepChomped(parts: GameParts): void {
  for (const player of [...parts.team1.players, ...parts.team2.players]) {
    const chomp = (player.conditions ?? []).find(
      (c) => c.type === PlayerCondition.CHOMPED
    );
    if (!chomp) continue;
    const chomper = chomp.byPlayerId
      ? parts.game.getPlayerById(chomp.byPlayerId)
      : undefined;
    const marking =
      !!chomper?.gridPosition &&
      !!player.gridPosition &&
      hasTackleZone(chomper) &&
      Math.abs(chomper.gridPosition.x - player.gridPosition.x) <= 1 &&
      Math.abs(chomper.gridPosition.y - player.gridPosition.y) <= 1 &&
      !(
        chomper.gridPosition.x === player.gridPosition.x &&
        chomper.gridPosition.y === player.gridPosition.y
      );
    if (!marking) {
      removeCondition(player, PlayerCondition.CHOMPED);
      parts.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    }
  }
}

/**
 * Sports-Wizards cast "at the end of any Turn, before the next Turn
 * begins" (2025 rulebook p.149): the coach whose turn ended is asked
 * first. Null when neither team has a spell left.
 */
export function castSportsWizards(
  parts: GameParts,
  endingTeamId: string
): Promise<void> | null {
  if (parts.state.phase !== GamePhase.PLAY) return null;
  const other =
    endingTeamId === parts.team1.id ? parts.team2.id : parts.team1.id;
  const casters = [endingTeamId, other].filter((teamId) =>
    holdsSportsWizard(parts.state, teamId)
  );
  if (casters.length === 0) return null;
  for (const teamId of casters) {
    parts.flowManager.add(new CastSportsWizardOperation(teamId));
  }
  return whenSettled(parts).then(() => undefined);
}

/** End-of-opposition-turn trigger: fold the reacting team (Pick-Me-Up). */
export function handleTurnEnding(parts: GameParts, endingTeamId: string): void {
  // Cheering Fans: an unused owed Offensive Assist dies with its turn.
  const owed = getDriveEffects(parts.state).owedAssists[endingTeamId];
  if (owed && owed.turn === parts.turnManager.getTurnNumber(endingTeamId)) {
    delete getDriveEffects(parts.state).owedAssists[endingTeamId];
    parts.eventBus.emit(GameEventNames.DriveEffectExpired, {
      teamId: endingTeamId,
      effect: "offensive-assist",
      detail: "the Cheering Fans assist went unused",
    });
  }

  const reacting = endingTeamId === parts.team1.id ? parts.team2 : parts.team1;
  const players = reacting.players.filter((p) => p.gridPosition);
  const ctx: TurnEndingContext = {
    endingTeamId,
    players,
    dice: parts.diceController,
    rolledFor: new Set(),
    standUp: [],
    triggers: [],
  };
  foldTurnEnding(ctx, players);
  for (const id of ctx.standUp) {
    const p = parts.game.getPlayerById(id);
    if (p && p.status === PlayerStatus.PRONE) {
      p.status = PlayerStatus.ACTIVE;
      parts.eventBus.emit(GameEventNames.PlayerStoodUp, {
        playerId: id,
        cost: 0,
      });
      parts.eventBus.emit(GameEventNames.PlayerStatusChanged, p);
    }
  }
  for (const t of ctx.triggers) {
    parts.eventBus.emit(GameEventNames.SkillTriggered, t);
  }
}
