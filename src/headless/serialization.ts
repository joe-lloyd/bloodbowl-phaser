import { ballsFromWire, ballsToWire } from "@/game/rules/balls";
import { type KickRecord, type KickResolution, newKick } from "../game/kickoff/kickRecord";
import type { MatchType } from "../game/variants/gameTypes";
import type { Venue } from "../game/variants/pitchLayouts";
import { parseMatchSave, normalizeMatchSave } from "../boundary/matchSave";
import type { Weather } from "../game/rules/weather";
import { assertPregameSaveable } from "../game/inducements/pregame";
import {
  type GameState,
  GamePhase,
  SubPhase,
  type TurnData,
  type MatchResult,
} from "../types/GameState";
import { type Team } from "../types/Team";
import { type SeatedTeams, seatedTeams } from "../game/seating";
import {
  type Player,
  type PlayerStats,
  PlayerStatus,
  type PlayerConditionInstance,
} from "../types/Player";
import { type RNGState } from "../services/rng/RNGService";
import { type MatchStatsSnapshot } from "../game/progression/MatchStats";
import { type CompetitionContext } from "../competition/types";
import { type TurnManagerState } from "../game/managers/TurnManager";
import { type SetupState } from "../types/SetupTypes";
import { type InducementsMatchState } from "../types/Inducements";
import { teamRerollsLeft } from "../game/teamRerolls";
import {
  type SpendWire,
  spendFromWire,
  spendToWire,
} from "../game/rules/turnSpend";

export interface TurnSnapshot extends SpendWire {
  teamId: string;
  turnNumber: number;
  isHalf2: boolean;

  extraTime?: boolean;
  activatedPlayerIds: string[];
  hasThrownTeamMate: boolean;
  hasKickedTeamMate: boolean;
  hasThrownBomb: boolean;
  hasPunted?: boolean;
  endsAfterActivation?: true;
  scoringTeamIds?: string[];
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
  points?: Record<string, number>;

  knockout?: boolean;

  paysWinnings?: boolean;

  competition?: boolean;

  gameType?: MatchType;

  venue?: Venue;
  weather: Weather;
  ballPosition: { x: number; y: number } | null;
  extraBalls?: ({ x: number; y: number } | null)[];
  activePlayer: GameState["activePlayer"];
  setup?: SetupState | null;

  result?: MatchResult;
  teams: TeamSnapshot[];

  driveEffects?: GameState["driveEffects"];

  lostBall?: GameState["lostBall"];

  bribes?: GameState["bribes"];

  weatherReady?: GameState["weatherReady"];

  teamRerollsUsed?: GameState["teamRerollsUsed"];

  leaderRerolls?: GameState["leaderRerolls"];

  veteranRerollsUsed?: GameState["veteranRerollsUsed"];

  briberyRerollsUsed?: GameState["briberyRerollsUsed"];

  stallingPlayerIds?: GameState["stallingPlayerIds"];

  seriousKnockoutIds?: GameState["seriousKnockoutIds"];

  turnUsage?: GameState["turnUsage"];

  raisedDead?: GameState["raisedDead"];

  fanFactors?: GameState["fanFactors"];

  inducements?: InducementsMatchState;
  pregameInducements?: GameState["pregameInducements"];

  matchInducements?: GameState["matchInducements"];

  kick?: KickRecord;

  kickoffResolution?: KickResolution;

  kickoffKickResolved?: { isTeam1Kicking: boolean };

  turnManager?: import("../game/managers/TurnManager").TurnManagerState;
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
  teams: SeatedTeams;
  drive: MatchDriveAssignment;
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  turnManager?: TurnManagerState;
  competition?: CompetitionContext;

  computer?: ComputerMatchSave;
}

export type ComputerMatchSave =
  | { computerTeamId: string; difficulty: string }
  | { humanTeamId: string; difficulty: string };

export interface CreateMatchSaveInput {
  state: GameState;
  teams: SeatedTeams;
  drive: Omit<MatchDriveAssignment, "half"> & { half?: 1 | 2 };
  rng: RNGState;
  matchStats: MatchStatsSnapshot;
  turnManager?: TurnManagerState;
  competition?: CompetitionContext;
  computer?: ComputerMatchSave;
  savedAt?: number;
}

function rerollFields(source: GameState | GameSnapshot) {
  return {
    ...(source.bribes !== undefined && { bribes: structuredClone(source.bribes) }),
    ...(source.weatherReady !== undefined && { weatherReady: structuredClone(source.weatherReady) }),
    ...(source.teamRerollsUsed !== undefined && { teamRerollsUsed: structuredClone(source.teamRerollsUsed) }),
    ...(source.leaderRerolls !== undefined && { leaderRerolls: structuredClone(source.leaderRerolls) }),
    ...(source.veteranRerollsUsed !== undefined && { veteranRerollsUsed: structuredClone(source.veteranRerollsUsed) }),
    ...(source.briberyRerollsUsed !== undefined && { briberyRerollsUsed: structuredClone(source.briberyRerollsUsed) }),
  };
}

function driveFields(source: GameState | GameSnapshot) {
  return {
    ...(source.driveEffects !== undefined && { driveEffects: structuredClone(source.driveEffects) }),
    ...(source.lostBall !== undefined && { lostBall: source.lostBall }),
    ...(source.stallingPlayerIds !== undefined && { stallingPlayerIds: structuredClone(source.stallingPlayerIds) }),
    ...(source.seriousKnockoutIds !== undefined && { seriousKnockoutIds: structuredClone(source.seriousKnockoutIds) }),
    ...(source.turnUsage !== undefined && { turnUsage: structuredClone(source.turnUsage) }),
    ...(source.raisedDead !== undefined && { raisedDead: structuredClone(source.raisedDead) }),
    ...(source.fanFactors !== undefined && { fanFactors: structuredClone(source.fanFactors) }),
  };
}

function inducementFields(source: GameState | GameSnapshot) {
  return {
    ...(source.inducements !== undefined && { inducements: structuredClone(source.inducements) }),
    ...(source.pregameInducements !== undefined && { pregameInducements: structuredClone(source.pregameInducements) }),
    ...(source.matchInducements !== undefined && { matchInducements: structuredClone(source.matchInducements) }),
    ...(source.kick !== undefined && { kick: structuredClone(source.kick) }),
    ...(source.result !== undefined && { result: structuredClone(source.result) }),
  };
}

function optionalTurnFields(turn: TurnData | TurnSnapshot) {
  return {
    ...(turn.hasPunted && { hasPunted: true }),
    ...(turn.endsAfterActivation && {
      endsAfterActivation: turn.endsAfterActivation,
    }),
    ...(turn.scoringTeamIds && { scoringTeamIds: [...turn.scoringTeamIds] }),
  };
}

export function serializeGameState(
  state: GameState,
  teams: readonly Team[]
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
      ...(state.turn.extraTime && { extraTime: true }),
      activatedPlayerIds: [...state.turn.activatedPlayerIds],
      ...spendToWire(state.turn.spend, teams.length),
      hasThrownTeamMate: state.turn.hasThrownTeamMate,
      hasKickedTeamMate: state.turn.hasKickedTeamMate,
      hasThrownBomb: state.turn.hasThrownBomb,
      movementUsed,
      ...optionalTurnFields(state.turn),
    },
    score: { ...state.score },
    ...(state.points && { points: { ...state.points } }),
    ...rerollFields(state),
    ...driveFields(state),
    ...inducementFields(state),

    ...(state.knockout && { knockout: true }),
    ...(state.paysWinnings && { paysWinnings: true }),
    ...(state.competition && { competition: true }),
    ...formatFields(state),
    weather: state.weather,
    ...ballsToWire(state.balls),
    activePlayer: state.activePlayer ? { ...state.activePlayer } : null,
    setup: state.setup ? structuredClone(state.setup) : null,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      rerolls: teamRerollsLeft(state, team),
      players: team.players.map((p) => playerSnapshot(p, state.turn)),
    })),
  };
}

function playerSnapshot(p: Player, turn: TurnData): PlayerSnapshot {
  return {
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
    movementUsed: turn.movementUsed.get(p.id) ?? 0,
  };
}

function formatFields(source: Pick<GameState, "gameType" | "venue">) {
  return {
    ...(source.gameType !== undefined && { gameType: source.gameType }),
    ...(source.venue !== undefined && { venue: source.venue }),
  };
}

function matchFlags(snapshot: GameSnapshot) {
  return {
    ...(snapshot.knockout && { knockout: true }),
    ...(snapshot.paysWinnings && { paysWinnings: true }),
    ...(snapshot.competition && { competition: true }),
    ...formatFields(snapshot),
  };
}

function legacyKick(snapshot: GameSnapshot): { kick?: KickRecord } {
  const { kickoffKickResolved: kicked, kickoffResolution: resolution } = snapshot;
  const kicker = snapshot.teams[kicked?.isTeam1Kicking ? 0 : 1];
  if (snapshot.kick || !kicked || !kicker) return {};
  const flying = resolution ? "high-kick" : "event";
  const stage = snapshot.phase === GamePhase.KICKOFF ? flying : "landed";
  return {
    kick: {
      ...newKick(kicker.id, stage, stage !== "landed" && snapshot.ballPosition === null),
      resolution: resolution ?? null,
    },
  };
}

function rivalIds(snapshot: GameSnapshot): string[] {
  return snapshot.teams
    .map((team) => team.id)
    .filter((id) => id !== snapshot.turn.teamId);
}

export function deserializeGameState(snapshot: GameSnapshot): GameState {
  const turn: TurnData = {
    teamId: snapshot.turn.teamId,
    turnNumber: snapshot.turn.turnNumber,
    isHalf2: snapshot.turn.isHalf2,
    ...(snapshot.turn.extraTime && { extraTime: true }),
    activatedPlayerIds: new Set(snapshot.turn.activatedPlayerIds),
    spend: spendFromWire(snapshot.turn, rivalIds(snapshot)),

    hasThrownTeamMate: snapshot.turn.hasThrownTeamMate,
    hasKickedTeamMate: snapshot.turn.hasKickedTeamMate,
    hasThrownBomb: snapshot.turn.hasThrownBomb,
    movementUsed: new Map(Object.entries(snapshot.turn.movementUsed)),
    ...optionalTurnFields(snapshot.turn),
  };

  return {
    phase: snapshot.phase,
    ...(snapshot.subPhase !== null && { subPhase: snapshot.subPhase }),
    activeTeamId: snapshot.activeTeamId,
    turn,
    score: { ...snapshot.score },
    ...(snapshot.points && { points: { ...snapshot.points } }),
    ...rerollFields(snapshot),
    ...driveFields(snapshot),
    ...inducementFields(snapshot),
    ...legacyKick(snapshot),

    ...matchFlags(snapshot),
    weather: snapshot.weather,
    balls: ballsFromWire(snapshot),
    activePlayer: snapshot.activePlayer ? { ...snapshot.activePlayer } : null,
    ...(snapshot.setup && { setup: structuredClone(snapshot.setup) }),
  };
}

export function replaceFields<T extends object>(target: T, source: T): T {
  for (const key of Object.keys(target)) {
    if (!(key in source)) Reflect.deleteProperty(target, key);
  }
  return Object.assign(target, source);
}

export function restoreTeam(team: Team, saved: Team): void {
  const copy = structuredClone(saved);
  const players = copy.players.map((record) => {
    const player = team.players.find((candidate) => candidate.id === record.id);
    return player ? replaceFields(player, record) : record;
  });
  team.players.splice(0, team.players.length, ...players);
  replaceFields(team, { ...copy, players: team.players });
}

export function applySnapshotToTeams(
  snapshot: GameSnapshot,
  teams: readonly Team[]
): void {
  const byId = new Map(
    snapshot.teams.flatMap((t) => t.players.map((p) => [p.id, p] as const))
  );

  for (const team of teams) {
    for (const player of team.players) {
      const snap = byId.get(player.id);
      if (!snap) continue;
      player.status = snap.status;
      if (snap.position) player.gridPosition = { ...snap.position };
      else delete player.gridPosition;
      player.conditions = snap.conditions.map((c) => ({ ...c }));
    }
  }
}

export function createMatchSave(input: CreateMatchSaveInput): MatchSave {
  assertPregameSaveable(input.state);
  const payload: MatchSave = {
    version: MATCH_SAVE_VERSION,
    savedAt: input.savedAt ?? Date.now(),
    snapshot: serializeGameState(input.state, input.teams),
    teams: seatedTeams(input.teams.map((team) => structuredClone(team))),
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
    ...(input.turnManager && { turnManager: structuredClone(input.turnManager) }),
    ...(input.competition && { competition: structuredClone(input.competition) }),
    ...(input.computer && { computer: { ...input.computer } }),
  };

  return normalizeMatchSave(payload);
}

export function serializeMatchSave(save: MatchSave): string {
  return JSON.stringify(save);
}

export function deserializeMatchSave(value: unknown): MatchSave {
  return parseMatchSave(value);
}

export interface RestoredMatchSave {
  save: MatchSave;
  state: GameState;
  teams: SeatedTeams;
}

export function restoreMatchSave(value: MatchSave | string): RestoredMatchSave {
  const save = deserializeMatchSave(value);
  const teams = seatedTeams(save.teams.map((team) => structuredClone(team)));
  applySnapshotToTeams(save.snapshot, teams);
  return {
    save,
    state: deserializeGameState(save.snapshot),
    teams,
  };
}
