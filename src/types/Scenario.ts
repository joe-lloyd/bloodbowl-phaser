import { GamePhase, SubPhase } from "./GameState";
import { PlayerStatus, PlayerStats, PlayerCondition } from "./Player";
import { RosterName } from "./Team";
import { SkillType } from "./Skills";
import type { Weather } from "../game/rules/weather";

/**
 * A skill to grant a placement — either the bare type, or a type plus its
 * parameter value for a parameterized family (Loner "4+", Animosity a
 * keyword, Bloodlust "2+").
 */
export type PlacementSkill =
  | SkillType
  | { type: SkillType; parameter: string | number };

export interface PlayerPlacement {
  playerIndex: number; // Index in the team.players array
  x: number; // Grid X
  y: number; // Grid Y
  status?: PlayerStatus; // Optional status override
  /** Skills granted for this scenario, additive to the player's roster skills */
  skills?: PlacementSkill[];
  /** Stat overrides for this scenario (e.g. ST 4 for a Break Tackle demo) */
  stats?: Partial<PlayerStats>;
  /** Named conditions to seed (e.g. Distracted, to test a lost Tackle Zone) */
  conditions?: PlayerCondition[];
  /** Make this player the team's Sevens Veteran (D8) for the scenario. */
  veteran?: true;
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
  /** Weather in effect; Perfect Conditions ("Nice") when omitted. */
  weather?: Weather;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  seed?: number; // Optional RNG seed for deterministic outcomes
  expectedOutcome?: string; // Optional description of what this seed produces
}
