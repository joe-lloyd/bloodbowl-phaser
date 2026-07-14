/**
 * Game state serialization - JSON-safe snapshots of the full game situation.
 *
 * The in-memory GameState uses Set/Map (activatedPlayerIds, movementUsed)
 * which JSON.stringify silently turns into {}. These functions convert to and
 * from plain-JSON structures with stable field names for external consumers
 * (CLI, AI agents, saves, replays).
 */

import { GameState, GamePhase, SubPhase, TurnData } from "../types/GameState";
import { Team } from "../types/Team";
import { PlayerStats, PlayerStatus } from "../types/Player";

export interface TurnSnapshot {
  teamId: string;
  turnNumber: number;
  isHalf2: boolean;
  activatedPlayerIds: string[];
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;
  movementUsed: Record<string, number>;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  teamId: string;
  number: number;
  positionName: string;
  position: { x: number; y: number } | null;
  status: PlayerStatus;
  stats: PlayerStats;
  skills: string[];
  movementUsed: number;
}

export interface TeamSnapshot {
  id: string;
  name: string;
  rerolls: number;
  players: PlayerSnapshot[];
}

export interface GameSnapshot {
  phase: GamePhase;
  subPhase: SubPhase | null;
  activeTeamId: string | null;
  turn: TurnSnapshot;
  score: Record<string, number>;
  weather: string;
  ballPosition: { x: number; y: number } | null;
  activePlayer: { id: string; action: string | null } | null;
  coachesEjected: string[];
  teams: TeamSnapshot[];
}

export function serializeGameState(
  state: GameState,
  teams: Team[]
): GameSnapshot {
  const movementUsed: Record<string, number> = {};
  state.turn.movementUsed.forEach((value, key) => {
    movementUsed[key] = value;
  });

  return {
    phase: state.phase,
    subPhase: state.subPhase ?? null,
    activeTeamId: state.activeTeamId,
    turn: {
      teamId: state.turn.teamId,
      turnNumber: state.turn.turnNumber,
      isHalf2: state.turn.isHalf2,
      activatedPlayerIds: Array.from(state.turn.activatedPlayerIds),
      hasBlitzed: state.turn.hasBlitzed,
      hasPassed: state.turn.hasPassed,
      hasHandedOff: state.turn.hasHandedOff,
      hasFouled: state.turn.hasFouled,
      movementUsed,
    },
    score: { ...state.score },
    weather: state.weather,
    ballPosition: state.ballPosition ? { ...state.ballPosition } : null,
    activePlayer: state.activePlayer ? { ...state.activePlayer } : null,
    coachesEjected: [...state.coachesEjected],
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      rerolls: team.rerolls,
      players: team.players.map((p) => ({
        id: p.id,
        name: p.playerName,
        teamId: p.teamId,
        number: p.number,
        positionName: p.positionName,
        position: p.gridPosition ? { ...p.gridPosition } : null,
        status: p.status,
        stats: { ...p.stats },
        skills: p.skills.map((s) => (typeof s === "string" ? s : s.type)),
        movementUsed: state.turn.movementUsed.get(p.id) ?? 0,
      })),
    })),
  };
}

/**
 * Rebuild an in-memory GameState (Set/Map restored) from a snapshot.
 * Player placements/statuses live on the Team objects; apply them too when
 * restoring a full game (see applySnapshotToTeams).
 */
export function deserializeGameState(snapshot: GameSnapshot): GameState {
  const turn: TurnData = {
    teamId: snapshot.turn.teamId,
    turnNumber: snapshot.turn.turnNumber,
    isHalf2: snapshot.turn.isHalf2,
    activatedPlayerIds: new Set(snapshot.turn.activatedPlayerIds),
    hasBlitzed: snapshot.turn.hasBlitzed,
    hasPassed: snapshot.turn.hasPassed,
    hasHandedOff: snapshot.turn.hasHandedOff,
    hasFouled: snapshot.turn.hasFouled,
    movementUsed: new Map(Object.entries(snapshot.turn.movementUsed)),
  };

  return {
    phase: snapshot.phase,
    subPhase: snapshot.subPhase ?? undefined,
    activeTeamId: snapshot.activeTeamId,
    turn,
    score: { ...snapshot.score },
    weather: snapshot.weather,
    ballPosition: snapshot.ballPosition ? { ...snapshot.ballPosition } : null,
    activePlayer: snapshot.activePlayer ? { ...snapshot.activePlayer } : null,
    coachesEjected: [...snapshot.coachesEjected],
  };
}

/**
 * Restore player placement/status onto live Team objects from a snapshot,
 * matching players by id.
 */
export function applySnapshotToTeams(
  snapshot: GameSnapshot,
  teams: Team[]
): void {
  const byId = new Map(
    snapshot.teams.flatMap((t) => t.players.map((p) => [p.id, p] as const))
  );

  teams.forEach((team) => {
    team.players.forEach((player) => {
      const snap = byId.get(player.id);
      if (!snap) return;
      player.status = snap.status;
      player.gridPosition = snap.position ? { ...snap.position } : undefined;
    });
  });
}
