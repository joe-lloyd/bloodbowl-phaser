import { rollSewerPits } from "./sewerPits";
import type { Player } from "@/types/Player";
import { GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import {
  PlayerStatus,
  PlayerCondition,
  hasCondition,
  removeCondition,
  hasTackleZone,
} from "@/types/Player";
import { foldTurnEnding, type TurnEndingContext } from "@/game/skills";
import { holdsSportsWizard } from "@/game/inducements/matchInducements";
import { CastSportsWizardOperation } from "@/game/inducements/sportsWizard";
import {
  CastNoviceWizardOperation,
  holdsNoviceWizard,
} from "@/game/inducements/noviceWizard";
import { getDriveEffects } from "@/game/kickoff/driveEffects";
import {
  WeatherTurnEndOperation,
  weatherActsAtTurnEnd,
} from "@/game/kickoff/driveHazards";
import type { GameParts } from "./parts";
import { whenSettled } from "./activation";

export function onPlayerDowned(parts: GameParts, playerId: string): void {
  const player = parts.game.getPlayerById(playerId);
  if (player && hasCondition(player, PlayerCondition.ROOTED)) {
    removeCondition(player, PlayerCondition.ROOTED);
    parts.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
  }
}

export function sweepChomped(parts: GameParts): void {
  for (const player of [...parts.team1.players, ...parts.team2.players]) {
    const chomp = (player.conditions ?? []).find(
      (c) => c.type === PlayerCondition.CHOMPED
    );
    if (!chomp) continue;
    const chomper = chomp.byPlayerId
      ? parts.game.getPlayerById(chomp.byPlayerId)
      : undefined;
    const marking = isChompMarking(chomper, player);
    if (!marking) {
      removeCondition(player, PlayerCondition.CHOMPED);
      parts.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    }
  }
}

function castSportsWizards(
  parts: GameParts,
  endingTeamId: string
): Promise<void> | null {
  if (parts.state.phase !== GamePhase.PLAY) return null;
  const other =
    endingTeamId === parts.team1.id ? parts.team2.id : parts.team1.id;
  const casters = [endingTeamId, other].filter((teamId) =>
    holdsSportsWizard(parts.state, teamId)
  );
  const novice = holdsNoviceWizard(parts.state, endingTeamId);
  if (casters.length === 0 && !novice) return null;
  if (novice) parts.flowManager.add(new CastNoviceWizardOperation(endingTeamId));
  for (const teamId of casters) {
    parts.flowManager.add(new CastSportsWizardOperation(teamId));
  }
  return whenSettled(parts).then(() => undefined);
}

export function turnEndHazards(
  parts: GameParts,
  endingTeamId: string
): Promise<void> | null {
  const weather =
    parts.state.phase === GamePhase.PLAY && weatherActsAtTurnEnd(parts.state);
  if (weather) parts.flowManager.add(new WeatherTurnEndOperation());
  const pits = rollSewerPits(parts);
  const wizards = castSportsWizards(parts, endingTeamId);
  if (wizards || !(weather || pits)) return wizards;
  return whenSettled(parts).then(() => undefined);
}

export function handleTurnEnding(parts: GameParts, endingTeamId: string): void {
  const owed = getDriveEffects(parts.state).owedAssists[endingTeamId];
  if (owed?.turn === parts.turnManager.getTurnNumber(endingTeamId)) {
    Reflect.deleteProperty(
      getDriveEffects(parts.state).owedAssists,
      endingTeamId
    );
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
    if (p?.status === PlayerStatus.PRONE) {
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

function isChompMarking(chomper: Player | undefined, player: Player): boolean {
  return (
    !!chomper?.gridPosition &&
    !!player.gridPosition &&
    hasTackleZone(chomper) &&
    Math.abs(chomper.gridPosition.x - player.gridPosition.x) <= 1 &&
    Math.abs(chomper.gridPosition.y - player.gridPosition.y) <= 1 &&
    !(
      chomper.gridPosition.x === player.gridPosition.x &&
      chomper.gridPosition.y === player.gridPosition.y
    )
  );
}
