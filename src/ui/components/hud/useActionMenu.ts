import type { BlockReplacement } from "../../../types/BlockReplacement";
import { type UIEvents } from "../../../types/events";
import { useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { PlayerStatus, type Player } from "../../../types/Player";
import { GamePhase, type GameState } from "../../../types/GameState";
import type { ActionType, GameEventNames } from "../../../types/events";
import {
  computeActionAvailability,
  noActionAvailability,
  type ActionAvailability,
  type TurnFlags,
} from "../../../game/rules/actionAvailability";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";
import { groundBall } from "../../../game/rules/ballInTheAir";
import { holdsMeasure } from "../../../game/inducements/matchInducements";
import { DesperateMeasure } from "../../../game/inducements/desperateMeasures";

export interface MenuTurnData {
  phase: GamePhase;
  activeTeamId: string | null;
  hasBlitzed?: boolean | null;
  hasPassed?: boolean | null;
  hasHandedOff?: boolean | null;
  hasFouled?: boolean | null;
  movementUsed?: Map<string, number> | Readonly<Record<string, number>>;
}

const EMPTY_AVAILABILITY: ActionAvailability = noActionAvailability();

export function actingSide(
  turnData: { phase?: GamePhase; activeTeamId?: string | null } | null
): {
  activeCharge: KickoffEventStepState | null;
  effectiveActiveTeamId: string | null | undefined;
} {
  const kickoffStep = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getKickoffEventStep()
    : null;
  const activeCharge =
    turnData?.phase === GamePhase.KICKOFF && kickoffStep?.charge?.activePlayerId
      ? kickoffStep
      : null;
  return {
    activeCharge,
    effectiveActiveTeamId: activeCharge?.teamId ?? turnData?.activeTeamId,
  };
}

export function razzleDazzle(player: Player | null, charging: boolean) {
  const state = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getState()
    : null;
  if (!player || !state)
    return {
      declaration: null,
      secondActionAfter: undefined,
      canRazzle: false,
    };
  const declaration =
    state.activePlayer?.id === player.id ? state.activePlayer : null;
  return {
    declaration,
    secondActionAfter: declaredSecondAction(declaration),
    canRazzle: canOfferRazzle(state, player, { charging, declaration }),
  };
}

function menuTurnFlags({
  turnData,
  activeCharge,
  state,
  teamId,
}: {
  turnData: {
    hasBlitzed?: boolean | null;
    hasPassed?: boolean | null;
    hasHandedOff?: boolean | null;
    hasFouled?: boolean | null;
  };
  activeCharge: KickoffEventStepState | null;
  state: GameState;
  teamId: string;
}): TurnFlags {
  return {
    hasBlitzed: activeCharge?.charge
      ? activeCharge.charge.budget.blitz <= 0
      : !!turnData.hasBlitzed,
    hasPassed: !!turnData.hasPassed,
    hasHandedOff: !!turnData.hasHandedOff,
    hasPunted: !activeCharge?.charge && !!state.turn.hasPunted,

    hasThrownTeamMate: activeCharge?.charge
      ? activeCharge.charge.budget.throwTeammate <= 0
      : state.turn.hasThrownTeamMate,
    hasKickedTeamMate: activeCharge?.charge
      ? activeCharge.charge.budget.kickTeammate <= 0
      : state.turn.hasKickedTeamMate,

    hasFouled:
      !!turnData.hasFouled &&
      !holdsMeasure(state, teamId, DesperateMeasure.GRUDGE_MATCH),
  };
}

function movementUsed(player: Player, turnData: MenuTurnData): number {
  if (ServiceContainer.isInitialized())
    return ServiceContainer.getInstance().gameService.getMovementUsed(
      player.id
    );
  const used = turnData.movementUsed;
  return used instanceof Map
    ? (used.get(player.id) ?? 0)
    : (used?.[player.id] ?? 0);
}

export function useMovementFlag(player: Player | null, turnData: MenuTurnData) {
  const [moved, setMoved] = useState(false);
  const [inputs, setInputs] = useState({ player, turnData });
  if (inputs.player !== player || inputs.turnData !== turnData) {
    setInputs({ player, turnData });
    if (player)
      setMoved(movementUsed(player, turnData) > 0 && !player.hasActed);
  }
  return [moved, setMoved] as const;
}

interface AvailabilityRequest {
  selectedPlayer: Player | null;
  effectiveActiveTeamId: string | null | undefined;
  turnData: MenuTurnData;
  activeCharge: KickoffEventStepState | null;
  hasMovedInAction: boolean;
  secondActionAfter: ActionType | undefined;
}

export function readMenuAvailability({
  selectedPlayer,
  effectiveActiveTeamId,
  turnData,
  activeCharge,
  hasMovedInAction,
  secondActionAfter,
}: AvailabilityRequest): ActionAvailability {
  if (!selectedPlayer || selectedPlayer.teamId !== effectiveActiveTeamId) {
    return EMPTY_AVAILABILITY;
  }
  try {
    if (!ServiceContainer.isInitialized()) return EMPTY_AVAILABILITY;
    const gs = ServiceContainer.getInstance().gameService;
    const live = gs.getPlayerById(selectedPlayer.id) ?? selectedPlayer;
    const normal = computeActionAvailability({
      player: live,

      ballPosition: groundBall(gs.getState()),
      opponents: gs.getOpponents(selectedPlayer.teamId),
      teammates: gs.getTeammates(selectedPlayer.id),
      reachable: gs.getAvailableMovements(selectedPlayer.id),
      turn: menuTurnFlags({
        turnData: turnData,
        activeCharge: activeCharge,
        state: gs.getState(),
        teamId: selectedPlayer.teamId,
      }),
      hasMovedInAction,
      ...(secondActionAfter === undefined
        ? {}
        : { secondActionAfter: secondActionAfter }),
    });
    return chargeAvailability(normal, live, activeCharge);
  } catch {
    return EMPTY_AVAILABILITY;
  }
}

function chargeAvailability(
  normal: ActionAvailability,
  live: Player,
  activeCharge: KickoffEventStepState | null
): ActionAvailability {
  if (!activeCharge || activeCharge.charge?.activePlayerId !== live.id) {
    return normal;
  }
  const budget = activeCharge.charge.budget;
  return {
    ...EMPTY_AVAILABILITY,
    move: live.status === PlayerStatus.ACTIVE,
    blitz: budget.blitz > 0 && normal.blitz,
    throwTeammate: budget.throwTeammate > 0 && normal.throwTeammate,
    kickTeammate: budget.kickTeammate > 0 && normal.kickTeammate,
  };
}

function declaredSecondAction(
  declaration: GameState["activePlayer"]
): ActionType | undefined {
  return declaration?.razzleDazzle?.awaitingSecond
    ? declaration.razzleDazzle.actions[0]
    : undefined;
}
export function menuActionRequest(
  playerId: string,
  action: ActionType,
  options: {
    blockReplacement: BlockReplacement | undefined;
    razzleOn: boolean;
    canRazzle: boolean;
  }
): UIEvents[typeof GameEventNames.UI_ActionSelected] {
  const { blockReplacement, razzleOn, canRazzle } = options;
  return {
    action,
    playerId,
    ...(blockReplacement === undefined ? {} : { blockReplacement }),
    ...(razzleOn && canRazzle && action !== "forgoe"
      ? { razzleDazzle: true }
      : {}),
  };
}

function canOfferRazzle(
  state: GameState,
  player: Player,
  {
    charging,
    declaration,
  }: { charging: boolean; declaration: GameState["activePlayer"] }
): boolean {
  return (
    !charging &&
    !declaration?.committed &&
    !declaration?.razzleDazzle &&
    holdsMeasure(state, player.teamId, DesperateMeasure.RAZZLE_DAZZLE)
  );
}
