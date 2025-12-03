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
}

export interface GameState {
  phase: GamePhase;
  activeTeamId: string | null;
  turn: TurnData;
  score: { [teamId: string]: number };
}
