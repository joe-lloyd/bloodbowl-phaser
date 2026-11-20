export type DeploymentRole = "line" | "support" | "flank" | "deep";

export interface FormationPosition {
  playerId: string;
  x: number;
  y: number;
  role?: DeploymentRole;
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

export type SetupRestrictionId =
  | "setup-area"
  | "neutral-zone"
  | "duplicate-square"
  | "wide-zone-limit"
  | "line-of-scrimmage"
  | "short-handed-line"
  | "max-seven"
  | "required-player-count"
  | "concession-decision"
  | "team-captain";

export interface SetupRestriction {
  id: SetupRestrictionId;
  satisfied: boolean;
  message: string;

  summary?: string;

  wideZones?: { top: number; bottom: number };

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

  swarming?: {
    roll: number;
    maximumAdditionalPlayers: number;
    additionalPlayerCount: number;
  };
}

export interface SetupState {
  kickingTeamId: string | null;
  receivingTeamId: string | null;
  currentTeamId: string | null;
  confirmedTeamIds: string[];
  teams: Record<string, SetupTeamStatus>;

  swarming?: {
    pendingTeamIds: string[];
    teams: Record<string, { roll: number; basePlayerIds: string[] }>;
  };
}

export interface SetupPlayerLimits {
  minimum: number;
  maximum: number;
}

export interface SetupFormationResult {
  placedPlayerIds: string[];
  skipped: { playerId?: string; reason: string }[];
  status: SetupTeamStatus;
}

export interface SetupConfig {
  minPlayers: number;
  maxPlayers?: number;
  pitchWidth: number;
  pitchHeight: number;
}
