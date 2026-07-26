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
  restrictions: SetupRestriction[];
}

export type SetupPhase = "coinflip" | "kicking" | "receiving" | "complete";

export type SetupRestrictionId =
  | "setup-area"
  | "neutral-zone"
  | "duplicate-square"
  | "wide-zone-limit"
  | "line-of-scrimmage"
  | "short-handed-line"
  | "max-seven"
  | "required-player-count"
  | "concession-decision";

export interface SetupRestriction {
  id: SetupRestrictionId;
  satisfied: boolean;
  message: string;
  /** False means the team lacks enough available players to meet this rule. */
  satisfiable: boolean;
}

export type SetupConcessionDecision =
  | "not-offered"
  | "pending"
  | "continue"
  | "conceded";

export interface SetupTeamStatus {
  teamId: string;
  placedPlayerCount: number;
  requiredPlayerCount: number;
  availablePlayerCount: number;
  restrictions: SetupRestriction[];
  canConfirm: boolean;
  concessionDecision: SetupConcessionDecision;
}

export interface SetupState {
  kickingTeamId: string | null;
  receivingTeamId: string | null;
  currentTeamId: string | null;
  confirmedTeamIds: string[];
  teams: Record<string, SetupTeamStatus>;
}

export interface SetupFormationResult {
  placedPlayerIds: string[];
  skipped: { playerId?: string; reason: string }[];
  status: SetupTeamStatus;
}

export interface SetupConfig {
  minPlayers: number; // Players used when the team can field a full setup
  maxPlayers?: number; // Sevens cap (defaults to minPlayers)
  pitchWidth: number; // Grid width (20)
  pitchHeight: number; // Grid height (11)
}
