import type { GameState } from "@/types/GameState";
import type { KickoffEvent, KickoffEventOutcome } from "./kickoffEvents";
import type { KickoffTurn } from "./kickoffTurn";

export type KickStage =
  | "reaction"
  | "event"
  | "coach"
  | "high-kick"
  | "scatter"
  | "landing"
  | "placing"
  | "landed";

export interface KickResolution {
  roll: number;
  event: KickoffEvent;
  meaning: string;
  outcome: KickoffEventOutcome;
}

export interface KickoffChoice {
  stage: "choose";
  event: KickoffEvent;
  teamId: string;
  selectionLimit: number;
  selectedPlayerIds: string[];
  landingSquare?: { x: number; y: number };
}

export interface KickoffRehearsal {
  event: KickoffEvent;
  selectionLimit?: number;
}

interface KickAim {
  playerId: string;
  targetX: number;
  targetY: number;
}

export interface KickRecord {
  kickingTeamId: string;
  stage: KickStage;
  aim: KickAim | null;
  touchback: boolean;
  touchbackTeamId: string | null;
  scatter: number;
  resolution: KickResolution | null;
  step: KickoffChoice | KickoffTurn | null;
  rehearsal: KickoffRehearsal | null;
}

export function newKick(
  kickingTeamId: string,
  stage: KickStage,
  touchback = false
): KickRecord {
  return {
    kickingTeamId,
    stage,
    aim: null,
    touchback,
    touchbackTeamId: null,
    scatter: 0,
    resolution: null,
    step: null,
    rehearsal: null,
  };
}

export function kickoffTurnOf(
  state: Pick<GameState, "kick">
): KickoffTurn | null {
  const step = state.kick?.step;
  return step?.stage === "play" ? step : null;
}

export function kickoffChoiceOf(
  state: Pick<GameState, "kick">
): KickoffChoice | null {
  const step = state.kick?.step;
  return step?.stage === "choose" ? step : null;
}
