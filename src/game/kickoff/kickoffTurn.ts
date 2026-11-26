import { GamePhase, type GameState, type TurnData } from "@/types/GameState";
import type { Player } from "@/types/Player";
import type { ActionType } from "@/types/events";
import { KickoffEvent } from "./kickoffEvents";
import { kickoffTurnOf } from "./kickRecord";
import { activeKickoffTableId } from "./kickoffTables";

export type KickoffTurnPlay =
  | { kind: "actions"; actions: ActionType[] }
  | { kind: "one-square" };

export interface KickoffTurn {
  stage: "play";
  event: KickoffEvent;
  playerIds: string[];
  selectionLimit: number;
  play: KickoffTurnPlay;
  resume: { activeTeamId: string | null; teamId: string; turnNumber: number };
}

const MINI_TURN_ACTIONS: ActionType[] = ["move", "blitz", "throwTeamMate"];

const ONE_SQUARE_EVENTS: ReadonlySet<KickoffEvent> = new Set([
  KickoffEvent.ALERT_DEFENCE,
  KickoffEvent.QUICK_SNAP,
  KickoffEvent.GET_READY_LADS,
]);

const ACTION_EVENTS: ReadonlyMap<KickoffEvent, ActionType[]> = new Map([
  [KickoffEvent.CHARGE, MINI_TURN_ACTIONS],
  [KickoffEvent.BLITZ, MINI_TURN_ACTIONS],
  [KickoffEvent.QUICK_ATTACK, ["block"]],
]);

export function kickoffTurnPlay(event: KickoffEvent): KickoffTurnPlay | null {
  if (ONE_SQUARE_EVENTS.has(event)) return { kind: "one-square" };
  const actions = ACTION_EVENTS.get(event);
  return actions ? { kind: "actions", actions: [...actions] } : null;
}

function mayKickTeamMate(event: KickoffEvent): boolean {
  return event === KickoffEvent.CHARGE && activeKickoffTableId() === "sevens";
}

export function unspentTurn(turn: TurnData): TurnData {
  return {
    teamId: turn.teamId,
    turnNumber: turn.turnNumber,
    isHalf2: turn.isHalf2,
    ...(turn.extraTime ? { extraTime: true } : {}),
    activatedPlayerIds: new Set(),
    hasBlitzed: false,
    hasPassed: false,
    hasHandedOff: false,
    hasFouled: false,
    hasThrownTeamMate: false,
    hasKickedTeamMate: false,
    hasThrownBomb: false,
    movementUsed: new Map(),
  };
}

export interface KickoffTurnStart {
  event: KickoffEvent;
  teamId: string;
  playerIds: string[];
  selectionLimit: number;
}

export function openedKickoffTurn(
  state: GameState,
  start: KickoffTurnStart,
  players: readonly Player[]
): { turn: TurnData; step: KickoffTurn } | null {
  const play = kickoffTurnPlay(start.event);
  if (!play) return null;
  const { event, teamId, selectionLimit } = start;
  const turn = {
    ...unspentTurn(state.turn),
    teamId,
    activatedPlayerIds: new Set(
      players.map(({ id }) => id).filter((id) => !start.playerIds.includes(id))
    ),
    hasKickedTeamMate: !mayKickTeamMate(event),
  };
  return {
    turn,
    step: {
      stage: "play",
      event,
      playerIds: [...start.playerIds],
      selectionLimit,
      play,
      resume: {
        activeTeamId: state.activeTeamId,
        teamId: state.turn.teamId,
        turnNumber: state.turn.turnNumber,
      },
    },
  };
}

export function closedKickoffTurn(
  turn: TurnData,
  { resume }: KickoffTurn
): TurnData {
  return {
    ...unspentTurn(turn),
    teamId: resume.teamId,
    turnNumber: resume.turnNumber,
  };
}

export function isTurnRunning(
  state: Pick<GameState, "phase" | "kick">
): boolean {
  return (
    state.phase === GamePhase.PLAY ||
    (state.phase === GamePhase.KICKOFF && kickoffTurnOf(state) !== null)
  );
}

export function kickoffTurnAllows(
  state: Pick<GameState, "kick">,
  action: ActionType
): boolean {
  const turn = kickoffTurnOf(state);
  if (!turn) return true;
  return turn.play.kind === "actions" && turn.play.actions.includes(action);
}

export function mayReselect(state: GameState): boolean {
  const { turn, activePlayer } = state;
  const running = kickoffTurnOf(state);
  return (
    !!running &&
    !activePlayer?.committed &&
    !activePlayer?.squigRageSettled &&
    turn.movementUsed.size === 0 &&
    running.playerIds.every((id) => !turn.activatedPlayerIds.has(id))
  );
}
