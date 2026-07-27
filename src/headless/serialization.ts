/**
 * Game state serialization - JSON-safe snapshots of the full game situation.
 *
 * The in-memory GameState uses Set/Map (activatedPlayerIds, movementUsed)
 * which JSON.stringify silently turns into {}. These functions convert to and
 * from plain-JSON structures with stable field names for external consumers
 * (CLI, AI agents, saves, replays).
 */

import {
  GameState,
  GamePhase,
  SubPhase,
  TurnData,
  MatchResult,
} from "../types/GameState";
import { Team } from "../types/Team";
import {
  PlayerStats,
  PlayerStatus,
  PlayerConditionInstance,
} from "../types/Player";
import { RNGState } from "../services/rng/RNGService";
import { MatchStatsSnapshot } from "../game/progression/MatchStats";
import { CompetitionContext } from "../competition/types";
import { TurnManagerState } from "../game/managers/TurnManager";
import { SetupState } from "../types/SetupTypes";
import { BlockReplacement } from "../types/BlockReplacement";

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
  /** Active conditions (Distracted, Rooted, Chomped). */
  conditions: PlayerConditionInstance[];
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
  activePlayer: {
    id: string;
    action: string | null;
    blockReplacement?: BlockReplacement;
    blockReplacementUsed?: boolean;
  } | null;
  coachesEjected: string[];
  setup?: SetupState | null;
  /** Absent until the match reaches GAME_OVER. */
  result?: MatchResult;
  teams: TeamSnapshot[];
  /** Kickoff-event drive effects; absent on pre-feature saves (= empty). */
  driveEffects?: import("../game/kickoff/driveEffects").DriveEffects;
  /** Bribes held per team (Get the Ref); absent on pre-feature saves. */
  bribes?: Record<string, number>;
}

export const MATCH_SAVE_VERSION = 1 as const;

export interface MatchDriveAssignment {
  kickingTeamId: string;
  receivingTeamId: string;
  half: 1 | 2;
}

export interface MatchSave {
  version: typeof MATCH_SAVE_VERSION;
  savedAt: number;
  snapshot: GameSnapshot;
  teams: [Team, Team];
  drive: MatchDriveAssignment;
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  turnManager?: TurnManagerState;
  competition?: CompetitionContext;
  presentation?: {
    pitchThemeId?: string;
  };
}

export interface CreateMatchSaveInput {
  state: GameState;
  teams: [Team, Team];
  drive: Omit<MatchDriveAssignment, "half"> & { half?: 1 | 2 };
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  turnManager?: TurnManagerState;
  competition?: CompetitionContext;
  presentation?: MatchSave["presentation"];
  savedAt?: number;
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
    driveEffects: state.driveEffects
      ? structuredClone(state.driveEffects)
      : undefined,
    bribes: state.bribes ? { ...state.bribes } : undefined,
    setup: state.setup ? structuredClone(state.setup) : null,
    result: state.result ? { ...state.result } : undefined,
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
        conditions: (p.conditions ?? []).map((c) => ({ ...c })),
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
    driveEffects: snapshot.driveEffects
      ? structuredClone(snapshot.driveEffects)
      : undefined,
    bribes: snapshot.bribes ? { ...snapshot.bribes } : undefined,
    setup: snapshot.setup ? structuredClone(snapshot.setup) : undefined,
    result: snapshot.result ? { ...snapshot.result } : undefined,
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
      player.conditions = (snap.conditions ?? []).map((c) => ({ ...c }));
    });
  });
}

/** Build a complete JSON-safe cold-restore payload without widening GameSnapshot. */
export function createMatchSave(input: CreateMatchSaveInput): MatchSave {
  const payload: MatchSave = {
    version: MATCH_SAVE_VERSION,
    savedAt: input.savedAt ?? Date.now(),
    snapshot: serializeGameState(input.state, input.teams),
    teams: input.teams.map((team) => structuredClone(team)) as [Team, Team],
    drive: {
      kickingTeamId: input.drive.kickingTeamId,
      receivingTeamId: input.drive.receivingTeamId,
      half: input.drive.half ?? (input.state.turn.isHalf2 ? 2 : 1),
    },
    rng: { ...input.rng },
    matchStats: {
      ...input.matchStats,
      players: input.matchStats.players.map((stats) => ({ ...stats })),
    },
    ...(input.turnManager
      ? { turnManager: structuredClone(input.turnManager) }
      : {}),
    ...(input.competition
      ? { competition: structuredClone(input.competition) }
      : {}),
    ...(input.presentation
      ? { presentation: structuredClone(input.presentation) }
      : {}),
  };

  return JSON.parse(JSON.stringify(payload)) as MatchSave;
}

export function serializeMatchSave(save: MatchSave): string {
  return JSON.stringify(save);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deserializeMatchSave(value: string | unknown): MatchSave {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !isRecord(parsed) ||
    parsed.version !== MATCH_SAVE_VERSION ||
    typeof parsed.savedAt !== "number" ||
    !isRecord(parsed.snapshot) ||
    !Array.isArray(parsed.teams) ||
    parsed.teams.length !== 2 ||
    !isRecord(parsed.drive) ||
    typeof parsed.drive.kickingTeamId !== "string" ||
    typeof parsed.drive.receivingTeamId !== "string" ||
    !isRecord(parsed.rng) ||
    !isRecord(parsed.matchStats)
  ) {
    throw new Error("unsupported-or-invalid-match-save");
  }
  return parsed as unknown as MatchSave;
}

export interface RestoredMatchSave {
  save: MatchSave;
  state: GameState;
  teams: [Team, Team];
}

/** Rebuild mutable teams and GameState from a validated save. */
export function restoreMatchSave(value: MatchSave | string): RestoredMatchSave {
  const save = deserializeMatchSave(value);
  const teams = save.teams.map((team) => structuredClone(team)) as [Team, Team];
  applySnapshotToTeams(save.snapshot, teams);
  return {
    save,
    state: deserializeGameState(save.snapshot),
    teams,
  };
}
