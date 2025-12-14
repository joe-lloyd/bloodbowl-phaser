export enum SubPhase {
  // SETUP Sub-Phases
  WEATHER = "WEATHER",
  COIN_FLIP = "COIN_FLIP",
  SETUP_KICKING = "SETUP_KICKING",
  SETUP_RECEIVING = "SETUP_RECEIVING",

  // KICKOFF Sub-Phases
  SETUP_KICKOFF = "SETUP_KICKOFF",
  ROLL_KICKOFF = "ROLL_KICKOFF",
  RESOLVE_KICKOFF = "RESOLVE_KICKOFF",
  PLACE_BALL = "PLACE_BALL",

  // PLAY Sub-Phases
  TURN_RECEIVING = "TURN_RECEIVING",
  TURN_KICKING = "TURN_KICKING",

  // END OF DRIVE Sub-Phases
  SCORING = "SCORING",
  RECOVER_KO = "RECOVER_KO",
  SECRET_WEAPONS = "SECRET_WEAPONS"
}

export enum GamePhase {
  SETUP = "SETUP",
  KICKOFF = "KICKOFF",
  PLAY = "PLAY",
  TOUCHDOWN = "TOUCHDOWN",
  HALFTIME = "HALFTIME",
  GAME_OVER = "GAME_OVER",
}

export interface TurnData {
  teamId: string;
  turnNumber: number; // 1-8 (or 1-6 for Sevens)
  isHalf2: boolean;
  activatedPlayerIds: Set<string>;
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;
  movementUsed: Map<string, number>;
}


export type TurnState = TurnData;

export interface GameState {
  phase: GamePhase;
  subPhase?: SubPhase;
  activeTeamId: string | null;
  turn: TurnData;
  score: { [key: string]: number };
}
