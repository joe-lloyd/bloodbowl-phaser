/**
 * Shared types for setup controllers
 */

export interface FormationPosition {
  playerId: string;
  x: number;
  y: number;
}

export interface Formation {
  name: string;
  positions: FormationPosition[];
}

export interface SetupZone {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type SetupPhase = "coinflip" | "kicking" | "receiving" | "complete";

export interface SetupConfig {
  minPlayers: number; // Minimum players required (typically 7)
  pitchWidth: number; // Grid width (20)
  pitchHeight: number; // Grid height (11)
}
