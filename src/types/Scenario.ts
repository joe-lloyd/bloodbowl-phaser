import { GamePhase, SubPhase } from "./GameState";
import { PlayerStatus, PlayerStats } from "./Player";
import { RosterName } from "./Team";
import { SkillType } from "./Skills";

export interface PlayerPlacement {
  playerIndex: number; // Index in the team.players array
  x: number; // Grid X
  y: number; // Grid Y
  status?: PlayerStatus; // Optional status override
  /** Skills granted for this scenario, additive to the player's roster skills */
  skills?: SkillType[];
  /** Stat overrides for this scenario (e.g. ST 4 for a Break Tackle demo) */
  stats?: Partial<PlayerStats>;
}

export interface ScenarioSetup {
  team1Placements: PlayerPlacement[];
  team2Placements: PlayerPlacement[];
  ballPosition?: { x: number; y: number };
  activeTeam: "team1" | "team2";
  turn?: number;
  phase: GamePhase;
  subPhase: SubPhase;
  team1Roster?: RosterName;
  team2Roster?: RosterName;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  seed?: number; // Optional RNG seed for deterministic outcomes
  expectedOutcome?: string; // Optional description of what this seed produces
}
