import { kickoffTurnOf } from "../../../game/kickoff/kickRecord";
import type { BlockReplacement } from "../../../types/BlockReplacement";
import { type UIEvents } from "../../../types/events";
import { useState } from "react";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { type Player } from "../../../types/Player";
import { GamePhase, type GameState } from "../../../types/GameState";
import type { ActionType, GameEventNames, MovementHalf } from "../../../types/events";
import {
  canBlitzTo,
  canFoulFrom,
  computeActionAvailability,
  noActionAvailability,
  restrictAvailability,
  type ActionAvailability,
  type TurnFlags,
} from "../../../game/rules/actionAvailability";
import { kickoffTurnAllows } from "../../../game/kickoff/kickoffTurn";
import { ballInReach, groundBall } from "../../../game/rules/balls";
import { holdsMeasure, spendFor } from "../../../game/inducements/matchInducements";
import { DesperateMeasure } from "../../../game/inducements/desperateMeasures";
import {
  freshSpend,
  maySpend,
  type TurnSpend,
} from "../../../game/rules/turnSpend";

export interface MenuTurnData {
  phase: GamePhase;
  activeTeamId: string | null;
  spend?: TurnSpend | null;
  movementUsed?: Map<string, number> | Readonly<Record<string, number>>;
}

const EMPTY_AVAILABILITY: ActionAvailability = noActionAvailability();

export function actingSide(
  turnData: { phase: GamePhase; activeTeamId: string | null },
  player: Player | null
): string | null {
  if (turnData.phase !== GamePhase.KICKOFF) return turnData.activeTeamId;
  if (!player || !ServiceContainer.isInitialized()) return null;
  const { gameService } = ServiceContainer.getInstance();
  const state = gameService.getState();
  const acts =
    kickoffTurnOf(state)?.play.kind === "actions" &&
    gameService.canActivate(player.id);
  return acts ? state.turn.teamId : null;
}

export function razzleDazzle(player: Player | null) {
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
    canRazzle: canOfferRazzle(state, player, declaration),
  };
}

function menuTurnFlags({
  turnData,
  state,
  teamId,
}: {
  turnData: { spend?: TurnSpend | null };
  state: GameState;
  teamId: string;
}): TurnFlags {
  return {
    spend: spendFor(state, teamId, turnData.spend ?? freshSpend()),
    hasPunted: !!state.turn.hasPunted,

    hasThrownTeamMate: state.turn.hasThrownTeamMate,
    hasKickedTeamMate: state.turn.hasKickedTeamMate,
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
  hasMovedInAction: boolean;
  secondActionAfter: ActionType | undefined;
}

export function readMenuAvailability({
  selectedPlayer,
  effectiveActiveTeamId,
  turnData,
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
    const reachable = gs.getAvailableMovements(selectedPlayer.id, "jump");
    const here = live.gridPosition;
    const normal = computeActionAvailability({
      player: live,

      ballPosition: (here && ballInReach(gs.getState(), here, reachable)) ?? groundBall(gs.getState()),
      opponents: gs.getOpponents(selectedPlayer.teamId),
      teammates: gs.getTeammates(selectedPlayer.id),
      reachable,
      turn: menuTurnFlags({
        turnData: turnData,
        state: gs.getState(),
        teamId: selectedPlayer.teamId,
      }),
      hasMovedInAction,
      ...(secondActionAfter !== undefined && { secondActionAfter: secondActionAfter }),
    });
    const state = gs.getState();
    return restrictAvailability(normal, (action) =>
      kickoffTurnAllows(state, action)
    );
  } catch {
    return EMPTY_AVAILABILITY;
  }
}

export type TargetState = "open" | "spent" | "out-of-reach";

export interface RivalTarget {
  teamId: string;
  name: string;
  blitz: TargetState;
  foul: TargetState;
}

export function readMenuTargets(
  player: Player | null,
  turnData: MenuTurnData
): RivalTarget[] {
  if (!player?.gridPosition || !ServiceContainer.isInitialized()) return [];
  const gs = ServiceContainer.getInstance().gameService;
  const rivals = gs.getTeams().filter(({ id }) => id !== player.teamId);
  if (rivals.length < 2) return [];
  const ledger = spendFor(gs.getState(), player.teamId, turnData.spend ?? freshSpend());
  const ends = [player.gridPosition, ...gs.getAvailableMovements(player.id, "jump")];
  const state = (kind: "blitz" | "foul", teamId: string, reach: typeof canBlitzTo) => {
    if (!maySpend(ledger, { kind, against: teamId })) return "spent";
    const team = gs.getOpponents(player.teamId).filter((o) => o.teamId === teamId);
    return team.some((o) => reach(o, ends)) ? "open" : "out-of-reach";
  };
  return rivals.map(({ id, name }) => ({
    teamId: id,
    name,
    blitz: state("blitz", id, canBlitzTo),
    foul: state("foul", id, canFoulFrom),
  }));
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
    blockReplacement?: BlockReplacement | undefined;
    half?: MovementHalf | undefined;
    against?: string | undefined;
    razzleOn: boolean;
    canRazzle: boolean;
  }
): UIEvents[typeof GameEventNames.UI_ActionSelected] {
  const { blockReplacement, half, against, razzleOn, canRazzle } = options;
  return {
    action,
    playerId,
    ...(blockReplacement !== undefined && { blockReplacement }),
    ...(half !== undefined && { half }),
    ...(against !== undefined && { against }),
    ...(razzleOn && canRazzle && action !== "forgoe" && { razzleDazzle: true }),
  };
}

function canOfferRazzle(
  state: GameState,
  player: Player,
  declaration: GameState["activePlayer"]
): boolean {
  return (
    !kickoffTurnOf(state) &&
    !declaration?.committed &&
    !declaration?.razzleDazzle &&
    holdsMeasure(state, player.teamId, DesperateMeasure.RAZZLE_DAZZLE)
  );
}
