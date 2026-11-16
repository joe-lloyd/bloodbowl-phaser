import type { TeamPlayStats, Finding } from "../../../src/simulation/runMatch";
import type { CoachName } from "../../../src/simulation/commands/shared";

export interface StudyJob {
  id: string;
  cohort: "league" | "calibration" | "hard" | "legend" | "advanced";
  pair: string;
  seed: number;
  templates: [string, string];
  coaches: [CoachName, CoachName];
  receivingSide?: 0 | 1;
  persistentInjuries?: boolean;
}

export interface SkillObservation {
  side: number;
  playerId: string;
  skill: string;
  effect: string;
  action: string;
  phase: string;
  half: number;
  turn: number;
  zone: string;
  carrying: boolean;
  adjacentThralls: number;
  adjacentHelpers: number;
  scoreDifference: number;
  count: number;
  firstStep: number;
}

export interface RollTally {
  side: number;
  roll: string;
  action: string;
  carrying: boolean;
  adjacentThralls: number;
  adjacentHelpers: number;
  attempts: number;
  failures: number;
  turnoversInCommand: number;
}

export interface StudyGame extends StudyJob {
  initialReceivingSide?: number;
  playerLosses?: { deaths: number; missNextGame: number }[];
  observationVersion?: 2;
  completed: boolean;
  score: [number, number];
  stats: [TeamPlayStats, TeamPlayStats];
  findings: Finding[];
  ms: number;
  commands: number;
  skills: SkillObservation[];
  rolls: RollTally[];
  decisions: Record<string, number>;
  offered: Record<string, number>;
  selected: Record<string, number>;
  counters: Record<string, number>;
  error?: string;
}
